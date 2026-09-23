import type { User } from "@recettes/contract"
import { Context, Data, Effect, Layer, Option, Redacted } from "effect"
import { randomUUID } from "node:crypto"
import type { RepositoryError } from "./repository.ts"

export interface StoredUser extends User {
  readonly passwordHash: string
}

export class EmailAlreadyUsed extends Data.TaggedError("EmailAlreadyUsed")<{
  readonly email: string
}> {}

/** Le port de persistance des comptes. L'adresse est comparée sans casse. */
export class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    readonly findByEmail: (email: string) => Effect.Effect<Option.Option<StoredUser>, RepositoryError>
    readonly insert: (
      email: string,
      passwordHash: string
    ) => Effect.Effect<User, RepositoryError | EmailAlreadyUsed>
  }
>() {}

/** Le hachage des mots de passe, séparé du SQL : deux raisons de changer. */
export class PasswordHasher extends Context.Tag("PasswordHasher")<
  PasswordHasher,
  {
    readonly hash: (password: Redacted.Redacted<string>) => Effect.Effect<string>
    readonly verify: (hash: string, password: Redacted.Redacted<string>) => Effect.Effect<boolean>
  }
>() {}

export class Users extends Context.Tag("Users")<
  Users,
  {
    readonly create: (
      email: string,
      password: Redacted.Redacted<string>
    ) => Effect.Effect<User, RepositoryError | EmailAlreadyUsed>
    /** None pour un mot de passe faux comme pour une adresse inconnue. */
    readonly authenticate: (
      email: string,
      password: Redacted.Redacted<string>
    ) => Effect.Effect<Option.Option<User>, RepositoryError>
  }
>() {}

export const UsersLive = Layer.effect(
  Users,
  Effect.gen(function* () {
    const repository = yield* UserRepository
    const hasher = yield* PasswordHasher

    // Vérifié quand l'adresse est inconnue : le temps de réponse reste celui
    // d'un vrai hachage et ne révèle pas quels comptes existent.
    const decoy = yield* hasher.hash(Redacted.make(randomUUID()))

    return {
      create: (email, password) =>
        hasher.hash(password).pipe(Effect.flatMap((hash) => repository.insert(email, hash))),

      authenticate: (email, password) =>
        Effect.gen(function* () {
          const found = yield* repository.findByEmail(email)
          const hash = Option.match(found, {
            onNone: () => decoy,
            onSome: (user) => user.passwordHash,
          })
          const valid = yield* hasher.verify(hash, password)
          return valid ? Option.map(found, ({ id, email }) => ({ id, email })) : Option.none()
        }),
    }
  })
)

