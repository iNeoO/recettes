import { SqlClient } from "@effect/sql"
import { PgDrizzle, schema } from "@recettes/db"
import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm"
import { Effect, Layer, Option } from "effect"
import { RecipeRepository, RepositoryError } from "../domain/repository.ts"
import type { RecipeSummary } from "@recettes/contract"
import type { RecipeQuery } from "../domain/query.ts"
import { highlightsOf } from "./highlights.ts"

type RecipeRow = typeof schema.recipes.$inferSelect

const fields = (row: RecipeRow) => ({
  id: row.id,
  book: row.book as 1 | 2,
  page: row.page,
  title: row.title,
  category: row.category,
  servings: row.servings,
  // Le client ne voit jamais la clé Garage, seulement l'endpoint qui la sert.
  imageUrl: row.imageKey === null ? null : `/recipes/${row.id}/image`,
})

/**
 * Cherche dans le titre, la ligne imprimée et le nom canonique, insensible aux
 * accents et à la casse : « creme » doit trouver « Crème ». unaccent() vient de
 * la migration 0001. EXISTS et non JOIN : une recette dont deux ingrédients
 * correspondent ne doit sortir qu'une fois.
 */
const conditions = (query: RecipeQuery): Array<SQL> => {
  const where: Array<SQL> = []
  if (query.search !== undefined) {
    const pattern = `%${query.search}%`
    where.push(sql`(
      unaccent(${schema.recipes.title}) ILIKE unaccent(${pattern})
      OR EXISTS (
        SELECT 1 FROM ${schema.recipeIngredients}
        JOIN ${schema.ingredients}
          ON ${schema.ingredients.id} = ${schema.recipeIngredients.ingredientId}
        WHERE ${schema.recipeIngredients.recipeId} = ${schema.recipes.id}
          AND (unaccent(${schema.recipeIngredients.raw}) ILIKE unaccent(${pattern})
               OR unaccent(${schema.ingredients.name}) ILIKE unaccent(${pattern}))
      )
    )`)
  }
  // and() plus bas : chaque filtre restreint, il ne s'ajoute pas au search.
  if (query.category !== undefined) where.push(eq(schema.recipes.category, query.category))
  if (query.book !== undefined) where.push(eq(schema.recipes.book, query.book))
  return where
}

export const RecipeRepositoryLive = Layer.effect(
  RecipeRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle
    const raw = yield* SqlClient.SqlClient

    const summaries = (rows: ReadonlyArray<RecipeRow>) =>
      highlightsOf(
        raw,
        rows.map((row) => row.id)
      ).pipe(
        Effect.map((highlights) =>
          rows.map(
            (row): RecipeSummary => ({ ...fields(row), highlights: highlights.get(row.id) ?? [] })
          )
        )
      )

    return {
      list: (query) =>
        Effect.gen(function* () {
          const where = and(...conditions(query))
          const rows = yield* db
            .select()
            .from(schema.recipes)
            .where(where)
            // id départage le titre : sans ordre total, rien ne garantit qu'une
            // recette ne sorte pas sur deux pages. Non couvrable par un test.
            .orderBy(asc(schema.recipes.title), asc(schema.recipes.id))
            .limit(query.limit)
            .offset(query.offset)

          const counted = yield* db
            .select({ total: sql<number>`count(*)::int` })
            .from(schema.recipes)
            .where(where)

          return {
            items: yield* summaries(rows),
            total: counted[0]?.total ?? 0,
            limit: query.limit,
            offset: query.offset,
          }
        }).pipe(Effect.catchAll((cause) => new RepositoryError({ cause }))),

      findById: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(schema.recipes)
            .where(eq(schema.recipes.id, id))
            .limit(1)

          const row = rows[0]
          if (row === undefined) return Option.none()

          const ingredients = yield* db
            .select({
              name: schema.ingredients.name,
              quantity: schema.recipeIngredients.quantity,
              section: schema.recipeIngredients.section,
              raw: schema.recipeIngredients.raw,
            })
            .from(schema.recipeIngredients)
            .innerJoin(
              schema.ingredients,
              eq(schema.ingredients.id, schema.recipeIngredients.ingredientId)
            )
            .where(eq(schema.recipeIngredients.recipeId, id))
            // L'ordre imprimé sur la page, tel que l'ingestion l'a relevé.
            .orderBy(asc(schema.recipeIngredients.position))

          return Option.some({
            ...fields(row),
            instructions: row.instructions,
            ingredients,
          })
        }).pipe(Effect.catchAll((cause) => new RepositoryError({ cause }))),
      summaries: (ids) =>
        Effect.gen(function* () {
          if (ids.length === 0) return []
          const rows = yield* db
            .select()
            .from(schema.recipes)
            .where(inArray(schema.recipes.id, [...ids]))
          const byId = new Map(rows.map((row) => [row.id, row]))
          return yield* summaries(ids.flatMap((id) => byId.get(id) ?? []))
        }).pipe(Effect.catchAll((cause) => new RepositoryError({ cause }))),
      imageKeyById: (id) =>
        db
          .select({ imageKey: schema.recipes.imageKey })
          .from(schema.recipes)
          .where(eq(schema.recipes.id, id))
          .limit(1)
          .pipe(
            Effect.map((rows) => Option.fromNullable(rows[0]?.imageKey)),
            Effect.catchAll((cause) => new RepositoryError({ cause }))
          ),
    }
  })
)
