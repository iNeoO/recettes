import { describe, expect, it } from "@effect/vitest"
import { PgDrizzle, schema } from "@recettes/db"
import { Effect, Option, Redacted } from "effect"
import { hashToken } from "../src/domain/session.ts"
import { PasswordHasher, UserRepository, Users, UsersLive } from "../src/domain/users.ts"
import { advanceClock, resetClock } from "./clock.ts"
import {
  ACCOUNT,
  anonymous,
  authenticated,
  clientWithToken,
  fetchImage,
  fetchPath,
  login,
  loginRaw,
  seedAccount,
  TestServer,
} from "./harness.ts"
import { seed } from "./seed.ts"

const status = <A>(effect: Effect.Effect<A, unknown>) =>
  effect.pipe(
    Effect.map(() => 200),
    Effect.catchAll((error) =>
      Effect.succeed(
        typeof error === "object" && error !== null && "_tag" in error && error._tag === "Unauthorized"
          ? 401
          : -1
      )
    )
  )

describe("authentification", () => {
  it.layer(TestServer)("sessions", (it) => {
    it.effect("refuse sans cookie : liste, détail et image", () =>
      Effect.gen(function* () {
        yield* seed([{ book: 1, page: 1, title: "Bowl", imageKey: "1/0001.jpg" }])
        const api = yield* anonymous

        expect(yield* status(api.recipes.list({ urlParams: {} }))).toBe(401)
        expect(yield* status(api.recipes.byId({ path: { id: 1 } }))).toBe(401)
        const image = yield* fetchImage(1)
        expect(image.status).toBe(401)
        expect(yield* status(api.auth.me())).toBe(401)
      }))

    it.effect("connecte avec de bons identifiants et pose le cookie", () =>
      Effect.gen(function* () {
        yield* seedAccount()
        const response = yield* loginRaw(ACCOUNT.email, ACCOUNT.password)

        expect(response.status).toBe(200)
        const body: unknown = yield* Effect.promise(() => response.json())
        expect(body).toMatchObject({ email: ACCOUNT.email })
        expect(body).not.toHaveProperty("passwordHash")

        const cookie = response.headers.get("set-cookie") ?? ""
        expect(cookie).toMatch(/^session=[A-Za-z0-9_-]{43}; /)
        expect(cookie).toContain("Max-Age=604800")
        expect(cookie).toContain("Path=/")
        expect(cookie).toContain("HttpOnly")
        expect(cookie).toContain("Secure")
        expect(cookie).toContain("SameSite=Lax")
      }))

    it.effect("l'adresse se compare sans tenir compte de la casse", () =>
      Effect.gen(function* () {
        yield* seedAccount()
        const response = yield* loginRaw(ACCOUNT.email.toUpperCase(), ACCOUNT.password)
        expect(response.status).toBe(200)
      }))

    it.effect("refuse à l'identique un mauvais mot de passe et une adresse inconnue", () =>
      Effect.gen(function* () {
        yield* seedAccount()
        const wrongPassword = yield* loginRaw(ACCOUNT.email, "pas le bon")
        const unknownEmail = yield* loginRaw("personne@example.org", ACCOUNT.password)

        expect(wrongPassword.status).toBe(401)
        expect(unknownEmail.status).toBe(401)
        const bodies = yield* Effect.promise(() =>
          Promise.all([wrongPassword.text(), unknownEmail.text()])
        )
        expect(bodies[0]).toBe(bodies[1])
        expect(wrongPassword.headers.get("set-cookie")).toBeNull()
      }))

    it.effect("le cookie ouvre les recettes et /auth/me", () =>
      Effect.gen(function* () {
        yield* seed([{ book: 1, page: 1, title: "Bowl", imageKey: null }])
        const api = yield* authenticated

        const page = yield* api.recipes.list({ urlParams: {} })
        expect(page.total).toBe(1)
        const me = yield* api.auth.me()
        expect(me.email).toBe(ACCOUNT.email)
      }))

    it.effect("la session vaut 7 jours, fixes", () =>
      Effect.gen(function* () {
        yield* resetClock
        const token = yield* seedAccount().pipe(Effect.andThen(login()))
        const api = yield* clientWithToken(token)

        yield* advanceClock("6 days")
        expect(yield* status(api.auth.me())).toBe(200)

        yield* advanceClock("2 days")
        expect(yield* status(api.auth.me())).toBe(401)
        yield* resetClock
      }).pipe(Effect.ensuring(resetClock)))

    it.effect("la déconnexion révoque la session et efface le cookie", () =>
      Effect.gen(function* () {
        const token = yield* seedAccount().pipe(Effect.andThen(login()))
        const api = yield* clientWithToken(token)
        expect(yield* status(api.auth.me())).toBe(200)

        const response = yield* fetchPath("/auth/logout", {
          method: "POST",
          headers: { cookie: `session=${token}` },
        })
        expect(response.status).toBe(204)
        const cleared = response.headers.get("set-cookie") ?? ""
        expect(cleared).toMatch(/^session=; /)
        expect(cleared).toContain("Max-Age=0")

        expect(yield* status(api.auth.me())).toBe(401)

        const db = yield* PgDrizzle
        const rows = yield* db.select().from(schema.sessions)
        expect(rows.map((r) => r.tokenHash)).not.toContain(hashToken(token))
      }))

    it.effect("se déconnecter sans session est un 204 sans conséquence", () =>
      Effect.gen(function* () {
        const response = yield* fetchPath("/auth/logout", { method: "POST" })
        expect(response.status).toBe(204)
      }))

    it.effect("refuse un jeton forgé", () =>
      Effect.gen(function* () {
        const api = yield* clientWithToken("a".repeat(43))
        expect(yield* status(api.auth.me())).toBe(401)
      }))

    it.effect("la table sessions ne contient aucun jeton utilisable", () =>
      Effect.gen(function* () {
        const token = yield* seedAccount().pipe(Effect.andThen(login()))

        const db = yield* PgDrizzle
        const rows = yield* db.select().from(schema.sessions)
        const stored = rows.map((r) => r.tokenHash)
        expect(stored).toContain(hashToken(token))
        expect(stored).not.toContain(token)
        expect(stored.every((hash) => /^[0-9a-f]{64}$/.test(hash))).toBe(true)
        // Le hash ne vaut rien comme cookie.
        const api = yield* clientWithToken(hashToken(token))
        expect(yield* status(api.auth.me())).toBe(401)
      }))

    it.effect("la table users ne contient pas le mot de passe", () =>
      Effect.gen(function* () {
        yield* seedAccount()
        const db = yield* PgDrizzle
        const rows = yield* db.select().from(schema.users)
        for (const row of rows) {
          expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
          expect(row.passwordHash).not.toContain(ACCOUNT.password)
        }
      }))

    it.effect("la documentation reste publique", () =>
      Effect.gen(function* () {
        const response = yield* fetchPath("/docs")
        expect(response.status).toBe(200)
      }))

    it.effect("refuse une seconde fois la même adresse", () =>
      Effect.gen(function* () {
        yield* seedAccount()
        const users = yield* Users
        const result = yield* users
          .create(ACCOUNT.email.toUpperCase(), Redacted.make("autre"))
          .pipe(Effect.either)
        expect(result._tag).toBe("Left")
        if (result._tag === "Left") expect(result.left._tag).toBe("EmailAlreadyUsed")
      }))
  })
})

describe("Users.authenticate", () => {
  it.effect("hache un leurre quand l'adresse est inconnue", () =>
    Effect.gen(function* () {
      const verified: Array<string> = []
      const FakeHasher = PasswordHasher.of({
        hash: (password) => Effect.succeed(`hash(${Redacted.value(password)})`),
        verify: (hash, password) => {
          verified.push(hash)
          return Effect.succeed(hash === `hash(${Redacted.value(password)})`)
        },
      })
      const FakeRepository = UserRepository.of({
        findByEmail: (email) =>
          Effect.succeed(
            email === "anne@example.org"
              ? Option.some({ id: 1, email, passwordHash: "hash(secret)" })
              : Option.none()
          ),
        insert: () => Effect.die("non utilisé"),
      })

      const users = yield* Users.pipe(
        Effect.provide(UsersLive),
        Effect.provideService(PasswordHasher, FakeHasher),
        Effect.provideService(UserRepository, FakeRepository)
      )

      const known = yield* users.authenticate("anne@example.org", Redacted.make("secret"))
      expect(Option.isSome(known)).toBe(true)
      expect(verified).toHaveLength(1)

      const unknown = yield* users.authenticate("personne@example.org", Redacted.make("secret"))
      expect(Option.isNone(unknown)).toBe(true)
      // Le leurre a bien été vérifié : même coût qu'un vrai compte.
      expect(verified).toHaveLength(2)
      expect(verified[1]).not.toBe("hash(secret)")
    }))
})
