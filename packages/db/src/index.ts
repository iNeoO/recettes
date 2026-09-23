import { SqlClient } from "@effect/sql"
import { layer as drizzleLayer } from "@effect/sql-drizzle/Pg"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer } from "effect"

export * as schema from "./schema.ts"
export { PgDrizzle } from "@effect/sql-drizzle/Pg"
export * from "./persist.ts"

/** Connexion Postgres pilotée par DATABASE_URL, jamais par une valeur en dur. */
export const DatabaseLive = drizzleLayer.pipe(
  Layer.provideMerge(PgClient.layerConfig({ url: Config.redacted("DATABASE_URL") }))
)

export const countRecipes = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ count: string }>`SELECT count(*)::text AS count FROM recipes`
  return Number(rows[0]?.count ?? 0)
})
