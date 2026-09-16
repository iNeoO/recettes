import { SqlClient } from "@effect/sql"
import { layer as drizzleLayer } from "@effect/sql-drizzle/Pg"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer } from "effect"

export * as schema from "./schema.ts"
export { PgDrizzle } from "@effect/sql-drizzle/Pg"

/** Connexion Postgres pilotée par DATABASE_URL, jamais par une valeur en dur. */
export const DatabaseLive = drizzleLayer.pipe(
  Layer.provideMerge(PgClient.layerConfig({ url: Config.redacted("DATABASE_URL") }))
)

/** Vide les deux tables avant une réingestion : aucune donnée n'est saisie à la main. */
export const resetRecipes = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`TRUNCATE TABLE recipes RESTART IDENTITY CASCADE`
})

export const countRecipes = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ count: string }>`SELECT count(*)::text AS count FROM recipes`
  return Number(rows[0]?.count ?? 0)
})
