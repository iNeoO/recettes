import { PgDrizzle, schema } from "@recettes/db"
import { and, eq, gt } from "drizzle-orm"
import { Effect, Layer, Option } from "effect"
import { RepositoryError } from "../domain/repository.ts"
import { SessionStore } from "../domain/session.ts"

const asRepositoryError = <A, R>(effect: Effect.Effect<A, unknown, R>) =>
  Effect.mapError(effect, (cause) => new RepositoryError({ cause }))

export const SessionStoreLive = Layer.effect(
  SessionStore,
  Effect.gen(function* () {
    const db = yield* PgDrizzle

    return {
      insert: (session) =>
        db.insert(schema.sessions).values(session).pipe(asRepositoryError, Effect.asVoid),

      // `now` vient de l'appelant : voir SessionStore.
      findUser: (tokenHash, now) =>
        db
          .select({ id: schema.users.id, email: schema.users.email })
          .from(schema.sessions)
          .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
          .where(and(eq(schema.sessions.tokenHash, tokenHash), gt(schema.sessions.expiresAt, now)))
          .limit(1)
          .pipe(
            asRepositoryError,
            Effect.map((rows) => Option.fromNullable(rows[0]))
          ),

      remove: (tokenHash) =>
        db
          .delete(schema.sessions)
          .where(eq(schema.sessions.tokenHash, tokenHash))
          .pipe(asRepositoryError, Effect.asVoid),
    }
  })
)
