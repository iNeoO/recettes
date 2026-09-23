import { SqlClient } from "@effect/sql"
import { PgDrizzle } from "@effect/sql-drizzle/Pg"
import { inArray, sql } from "drizzle-orm"
import { Array as Arr, Effect } from "effect"
import * as schema from "./schema.ts"

/** Une ligne d'ingrédient telle que l'ingestion la produit, prête à écrire. */
export interface IngredientRow {
  readonly name: string
  readonly position: number
  readonly section: string | null
  readonly quantity: string | null
  readonly amount: number | null
  readonly unit: string | null
  readonly raw: string
}

/** Une recette prête à écrire ; la clé naturelle est (book, page). */
export interface RecipeRow {
  readonly book: number
  readonly page: number
  readonly title: string
  readonly category: string | null
  readonly servings: number | null
  readonly instructions: string
  readonly imageKey: string | null
  readonly ingredients: ReadonlyArray<IngredientRow>
}

/** Postgres plafonne à 65535 paramètres par requête. */
const CHUNK = 1000

/**
 * Écrit les recettes sans jamais détruire ce qui les référence.
 *
 * Une réingestion doit laisser les listes de courses intactes : les recettes
 * sont mises à jour sur (book, page) et gardent leur identifiant, les
 * ingrédients aussi sur leur nom (les cases cochées les référencent). Seules
 * les lignes recette-ingrédient sont remplacées, recette par recette. Le tout
 * dans une transaction : pas de recette sans ingrédients à mi-chemin.
 */
export const upsertRecipes = (recipes: ReadonlyArray<RecipeRow>) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient.SqlClient
    const db = yield* PgDrizzle
    if (recipes.length === 0) return []

    return yield* Effect.gen(function* () {
      const stored = yield* Effect.forEach(
        Arr.chunksOf(recipes, CHUNK),
        (batch) =>
          db
            .insert(schema.recipes)
            .values(
              batch.map((recipe) => ({
                book: recipe.book,
                page: recipe.page,
                title: recipe.title,
                category: recipe.category,
                servings: recipe.servings,
                instructions: recipe.instructions,
                imageKey: recipe.imageKey,
              }))
            )
            .onConflictDoUpdate({
              target: [schema.recipes.book, schema.recipes.page],
              set: {
                title: sql`excluded.title`,
                category: sql`excluded.category`,
                servings: sql`excluded.servings`,
                instructions: sql`excluded.instructions`,
                imageKey: sql`excluded.image_key`,
              },
            })
            .returning({ id: schema.recipes.id, book: schema.recipes.book, page: schema.recipes.page }),
        { concurrency: 1 }
      ).pipe(Effect.map(Arr.flatten))

      const idByKey = new Map(stored.map((row) => [`${row.book}/${row.page}`, row.id]))
      const idOf = (recipe: RecipeRow) => idByKey.get(`${recipe.book}/${recipe.page}`)!

      const names = [...new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.name)))]
      yield* Effect.forEach(
        Arr.chunksOf(names, CHUNK),
        (batch) =>
          db
            .insert(schema.ingredients)
            .values(batch.map((name) => ({ name })))
            .onConflictDoNothing(),
        { concurrency: 1, discard: true }
      )
      const known = yield* db
        .select({ id: schema.ingredients.id, name: schema.ingredients.name })
        .from(schema.ingredients)
      const idByName = new Map(known.map((row) => [row.name, row.id]))

      yield* Effect.forEach(
        Arr.chunksOf(stored.map((row) => row.id), CHUNK),
        (ids) =>
          db.delete(schema.recipeIngredients).where(inArray(schema.recipeIngredients.recipeId, ids)),
        { concurrency: 1, discard: true }
      )

      const rows = recipes.flatMap((recipe) =>
        recipe.ingredients.map((row) => ({
          recipeId: idOf(recipe),
          ingredientId: idByName.get(row.name)!,
          position: row.position,
          section: row.section,
          quantity: row.quantity,
          amount: row.amount,
          unit: row.unit,
          raw: row.raw,
        }))
      )
      yield* Effect.forEach(
        Arr.chunksOf(rows, CHUNK),
        (batch) => db.insert(schema.recipeIngredients).values(batch),
        { concurrency: 1, discard: true }
      )

      return stored
    }).pipe(sqlClient.withTransaction)
  })
