import { PgDrizzle, schema } from "@recettes/db"
import { Effect } from "effect"

export interface SeedRecipe {
  readonly book: 1 | 2
  readonly page: number
  readonly title: string
  readonly category?: string | null
  readonly servings?: number | null
  readonly instructions?: string
  readonly imageKey?: string | null
  readonly ingredients?: ReadonlyArray<{
    name: string
    quantity?: string | null
    section?: string | null
    raw?: string
  }>
}

/** Vide la base de test puis y installe exactement ces recettes. */
export const seed = (recipes: ReadonlyArray<SeedRecipe>) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle
    yield* db.delete(schema.recipeIngredients)
    yield* db.delete(schema.ingredients)
    yield* db.delete(schema.recipes)
    if (recipes.length === 0) return

    const inserted = yield* db
      .insert(schema.recipes)
      .values(
        recipes.map((recipe) => ({
          book: recipe.book,
          page: recipe.page,
          title: recipe.title,
          category: recipe.category ?? null,
          servings: recipe.servings ?? null,
          instructions: recipe.instructions ?? "Mélanger.",
          imageKey: recipe.imageKey ?? null,
        }))
      )
      .returning({ id: schema.recipes.id, page: schema.recipes.page })

    const byPage = new Map(inserted.map((row) => [row.page, row.id]))

    const names = [...new Set(recipes.flatMap((r) => (r.ingredients ?? []).map((i) => i.name)))]
    if (names.length === 0) return
    const known = yield* db
      .insert(schema.ingredients)
      .values(names.map((name) => ({ name })))
      .returning({ id: schema.ingredients.id, name: schema.ingredients.name })
    const byName = new Map(known.map((row) => [row.name, row.id]))

    const rows = recipes.flatMap((recipe) =>
      (recipe.ingredients ?? []).map((ingredient, position) => ({
        recipeId: byPage.get(recipe.page)!,
        ingredientId: byName.get(ingredient.name)!,
        position,
        quantity: ingredient.quantity ?? null,
        section: ingredient.section ?? null,
        raw: ingredient.raw ?? ingredient.name,
      }))
    )
    if (rows.length > 0) yield* db.insert(schema.recipeIngredients).values(rows)
  })
