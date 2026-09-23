import { describe, expect, it } from "@effect/vitest"
import { PgDrizzle, type RecipeRow, schema, upsertRecipes } from "@recettes/db"
import { Effect } from "effect"
import { asc } from "drizzle-orm"
import { TestServer } from "./harness.ts"
import { seed } from "./seed.ts"

/**
 * Le test de l'ingestion vit ici parce que c'est la seule suite branchée sur
 * une base : il prouve ce que la liste de courses exigera, des identifiants qui
 * survivent à une réingestion.
 */
const corpus = (over: Partial<RecipeRow> = {}): ReadonlyArray<RecipeRow> => [
  {
    book: 1,
    page: 1,
    title: "Curry de lentilles",
    category: "Plats",
    servings: 2,
    instructions: "Cuire.",
    imageKey: "1/0001.jpg",
    ingredients: [
      { name: "lentille", position: 0, section: null, quantity: "200g", amount: 200, unit: "g", raw: "200g de lentilles" },
      { name: "oignon", position: 1, section: null, quantity: "1", amount: 1, unit: "pièce", raw: "1 oignon" },
    ],
    ...over,
  },
  {
    book: 2,
    page: 7,
    title: "Salade",
    category: "Salades",
    servings: 2,
    instructions: "Mélanger.",
    imageKey: null,
    ingredients: [{ name: "oignon", position: 0, section: null, quantity: "1/2", amount: 0.5, unit: "pièce", raw: "1/2 oignon" }],
  },
]

const snapshot = Effect.gen(function* () {
  const db = yield* PgDrizzle
  const recipes = yield* db.select().from(schema.recipes).orderBy(asc(schema.recipes.id))
  const ingredients = yield* db.select().from(schema.ingredients).orderBy(asc(schema.ingredients.id))
  const lines = yield* db
    .select()
    .from(schema.recipeIngredients)
    .orderBy(asc(schema.recipeIngredients.recipeId), asc(schema.recipeIngredients.position))
  return { recipes, ingredients, lines }
})

describe("upsertRecipes", () => {
  it.layer(TestServer)("réingestion", (it) => {
    it.effect("rejouée à l'identique, ne change ni les identifiants ni le contenu", () =>
      Effect.gen(function* () {
        yield* seed([])
        yield* upsertRecipes(corpus())
        const first = yield* snapshot
        yield* upsertRecipes(corpus())
        const second = yield* snapshot

        expect(second.recipes).toEqual(first.recipes)
        expect(second.ingredients).toEqual(first.ingredients)
        expect(second.lines.map((l) => [l.recipeId, l.ingredientId, l.quantity])).toEqual(
          first.lines.map((l) => [l.recipeId, l.ingredientId, l.quantity])
        )
        expect(first.recipes).toHaveLength(2)
        expect(first.ingredients.map((i) => i.name).sort()).toEqual(["lentille", "oignon"])
      }))

    it.effect("met à jour une recette sur (book, page) et remplace ses lignes", () =>
      Effect.gen(function* () {
        yield* seed([])
        yield* upsertRecipes(corpus())
        const before = yield* snapshot

        yield* upsertRecipes(
          corpus({
            title: "Dahl de lentilles",
            ingredients: [
              { name: "lentille", position: 0, section: null, quantity: "250g", amount: 250, unit: "g", raw: "250g" },
              { name: "lait de coco", position: 1, section: null, quantity: "200ml", amount: 200, unit: "ml", raw: "200ml" },
            ],
          })
        )
        const after = yield* snapshot

        const curry = before.recipes.find((r) => r.page === 1)!
        const dahl = after.recipes.find((r) => r.page === 1)!
        expect(dahl.id).toBe(curry.id)
        expect(dahl.title).toBe("Dahl de lentilles")

        const lines = after.lines.filter((l) => l.recipeId === dahl.id)
        expect(lines.map((l) => l.quantity)).toEqual(["250g", "200ml"])
        // L'oignon n'est plus dans le curry mais reste dans le référentiel : la
        // salade l'emploie toujours, et son identifiant n'a pas bougé.
        const oignon = after.ingredients.find((i) => i.name === "oignon")!
        expect(oignon.id).toBe(before.ingredients.find((i) => i.name === "oignon")!.id)
        expect(after.ingredients.map((i) => i.name).sort()).toEqual([
          "lait de coco",
          "lentille",
          "oignon",
        ])
      }))

    it.effect("n'écrit rien pour un corpus vide", () =>
      Effect.gen(function* () {
        yield* seed([{ book: 1, page: 1, title: "Bowl" }])
        const stored = yield* upsertRecipes([])
        expect(stored).toEqual([])
        expect((yield* snapshot).recipes).toHaveLength(1)
      }))
  })
})
