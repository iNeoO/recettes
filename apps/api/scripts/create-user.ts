import { NodeRuntime } from "@effect/platform-node"
import { DatabaseLive } from "@recettes/db"
import { Console, Effect, Layer, Redacted } from "effect"
import { Users, UsersLive } from "../src/domain/users.ts"
import { PasswordHasherLive } from "../src/infra/argon2.ts"
import { UserRepositoryLive } from "../src/infra/users-drizzle.ts"

/**
 * Crée un compte : `pnpm create-user anne@example.org < mot-de-passe`.
 *
 * Le mot de passe arrive sur stdin, jamais en argument : la ligne de commande
 * finirait dans l'historique du shell et dans `ps`.
 */
const readStdin = Effect.async<string, Error>((resume) => {
  let data = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk: string) => (data += chunk))
  process.stdin.on("end", () => resume(Effect.succeed(data)))
  process.stdin.on("error", (error) => resume(Effect.fail(error)))
})

const program = Effect.gen(function* () {
  const email = process.argv[2]
  if (email === undefined || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return yield* Effect.fail(new Error("usage : create-user <email>  (mot de passe sur stdin)"))
  }
  const password = (yield* readStdin).replace(/\r?\n$/, "")
  if (password.length < 8) {
    return yield* Effect.fail(new Error("le mot de passe doit faire au moins 8 caractères"))
  }

  const users = yield* Users
  const user = yield* users.create(email, Redacted.make(password))
  yield* Console.log(`compte créé : ${user.email} (id ${user.id})`)
}).pipe(
  Effect.catchTag("EmailAlreadyUsed", ({ email }) =>
    Effect.fail(new Error(`un compte existe déjà pour ${email}`))
  ),
  // Une erreur attendue s'affiche en une ligne, sans trace de pile.
  Effect.catchIf(
    (error) => error instanceof Error,
    (error) => Console.error(error.message).pipe(Effect.tap(() => (process.exitCode = 1)))
  )
)

const Live = UsersLive.pipe(
  Layer.provide(Layer.mergeAll(UserRepositoryLive, PasswordHasherLive)),
  Layer.provide(DatabaseLive)
)

NodeRuntime.runMain(program.pipe(Effect.provide(Live)), { disablePrettyLogger: true })
