import { PgDrizzle, schema } from "@recettes/db"
import { sql } from "drizzle-orm"
import { Effect, Layer, Option } from "effect"
import { RepositoryError } from "../domain/repository.ts"
import { EmailAlreadyUsed, UserRepository } from "../domain/users.ts"

/** Code SQLSTATE d'une violation d'unicité. */
const UNIQUE_VIOLATION = "23505"

/**
 * L'erreur pg est enfouie : SqlError → « Failed query » de drizzle → erreur
 * du serveur, qui porte le code. On remonte la chaîne des causes.
 */
const isUniqueViolation = (error: unknown, depth = 0): boolean => {
  if (typeof error !== "object" || error === null || depth > 5) return false
  if ("code" in error && error.code === UNIQUE_VIOLATION) return true
  return "cause" in error && isUniqueViolation(error.cause, depth + 1)
}

export const UserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle

    return {
      findByEmail: (email) =>
        db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            passwordHash: schema.users.passwordHash,
          })
          .from(schema.users)
          .where(sql`lower(${schema.users.email}) = lower(${email})`)
          .limit(1)
          .pipe(
            Effect.map((rows) => Option.fromNullable(rows[0])),
            Effect.mapError((cause) => new RepositoryError({ cause }))
          ),

      insert: (email, passwordHash) =>
        db
          .insert(schema.users)
          .values({ email, passwordHash })
          .returning({ id: schema.users.id, email: schema.users.email })
          .pipe(
            Effect.flatMap((rows) =>
              rows[0] === undefined
                ? Effect.fail(new RepositoryError({ cause: "insertion sans retour" }))
                : Effect.succeed(rows[0])
            ),
            Effect.mapError((error) =>
              isUniqueViolation(error) ? new EmailAlreadyUsed({ email }) : new RepositoryError({ cause: error })
            )
          ),
    }
  })
)
