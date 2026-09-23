import type { User } from "@recettes/contract"
import { Clock, Context, Duration, Effect, Layer, Option, Redacted } from "effect"
import { createHash, randomBytes } from "node:crypto"
import type { RepositoryError } from "./repository.ts"

/** Fixe : la session vaut 7 jours depuis la connexion, sans glissement. */
export const SESSION_TTL = Duration.days(7)

export interface NewSession {
  readonly userId: number
  readonly tokenHash: string
  readonly expiresAt: Date
}

/**
 * Le port de persistance. Il ne voit que des empreintes, et reçoit l'instant
 * courant en paramètre : c'est l'horloge d'Effect qui décide de l'expiration,
 * pas le now() de Postgres — sans quoi « le 8e jour, 401 » serait intestable.
 */
export class SessionStore extends Context.Tag("SessionStore")<
  SessionStore,
  {
    readonly insert: (session: NewSession) => Effect.Effect<void, RepositoryError>
    readonly findUser: (tokenHash: string, now: Date) => Effect.Effect<Option.Option<User>, RepositoryError>
    readonly remove: (tokenHash: string) => Effect.Effect<void, RepositoryError>
  }
>() {}

/**
 * Le service que le middleware et la route image consultent. Le jeton rendu
 * au client n'est jamais stocké : seule son empreinte SHA-256 l'est.
 */
export class Sessions extends Context.Tag("Sessions")<
  Sessions,
  {
    readonly open: (userId: number) => Effect.Effect<Redacted.Redacted<string>, RepositoryError>
    readonly verify: (
      token: Redacted.Redacted<string>
    ) => Effect.Effect<Option.Option<User>, RepositoryError>
    readonly revoke: (token: Redacted.Redacted<string>) => Effect.Effect<void, RepositoryError>
  }
>() {}

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex")

export const SessionsLive = Layer.effect(
  Sessions,
  Effect.gen(function* () {
    const store = yield* SessionStore

    return {
      open: (userId) =>
        Effect.gen(function* () {
          const token = randomBytes(32).toString("base64url")
          const now = yield* Clock.currentTimeMillis
          yield* store.insert({
            userId,
            tokenHash: hashToken(token),
            expiresAt: new Date(now + Duration.toMillis(SESSION_TTL)),
          })
          return Redacted.make(token)
        }),

      verify: (token) => {
        const value = Redacted.value(token)
        // Cookie absent : pas d'aller-retour en base pour une empreinte du vide.
        if (value === "") return Effect.succeedNone
        return Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) => store.findUser(hashToken(value), new Date(now)))
        )
      },

      revoke: (token) => store.remove(hashToken(Redacted.value(token))),
    }
  })
)
