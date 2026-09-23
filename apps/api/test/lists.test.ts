import { describe, expect, it } from "@effect/vitest"
import { PgDrizzle, schema } from "@recettes/db"
import { Effect } from "effect"
import { listName } from "../src/domain/shopping-lists.ts"
import { authenticated, authenticatedAs, cookieHeader, fetchPath, sessionToken, TestServer } from "./harness.ts"
import { seed } from "./seed.ts"

const OTHER = { email: "bob@example.org", password: "another horse battery" }

/** Deux plats qui partagent la farine ; l'huile est de placard, le sel aussi. */
const corpus = () =>
  seed([
    {
      book: 1,
      page: 1,
      title: "Crêpes",
      ingredients: [
        { name: "farine", quantity: "200g", amount: 200, unit: "g" },
        { name: "lait", quantity: "50cl", amount: 500, unit: "ml" },
        { name: "huile d'olive", quantity: "1 filet" },
        { name: "sel", quantity: "1 pincée" },
      ],
    },
    {
      book: 1,
      page: 2,
      title: "Gâteau",
      imageKey: "1/0002.jpg",
      ingredients: [
        { name: "farine", quantity: "2 cuillères à soupe", amount: 20, unit: "g" },
        { name: "sucre", quantity: "100g", amount: 100, unit: "g" },
        // Chiffré ici, invariant ailleurs : il doit sortir dans items, pas au placard.
        { name: "sel", quantity: "2g", amount: 2, unit: "g" },
      ],
    },
    { book: 2, page: 1, title: "Pain", servings: null, ingredients: [{ name: "farine", quantity: "500g" }] },
  ])

const recipeId = (title: string) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle
    const titles = yield* db
      .select({ id: schema.recipes.id, title: schema.recipes.title })
      .from(schema.recipes)
    return titles.find((r) => r.title === title)!.id
  })

const tagOf = (error: unknown) =>
  typeof error === "object" && error !== null && "_tag" in error ? error._tag : error

describe("listes de courses", () => {
  it.layer(TestServer)("listes", (it) => {
    it.effect("crée une liste vide, nommée à la date du jour, pour 2 personnes", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const list = yield* api.lists.create()

        expect(list.name).toBe(listName(Date.now()))
        expect(list.servings).toBe(2)
        expect(list.recipes).toEqual([])
        expect(list.items).toEqual([])
        expect(list.pantry).toEqual([])
        expect(list.createdAt).toBeInstanceOf(Date)
      }))

    it.effect("n'énumère que les listes de l'utilisateur, la plus récente d'abord", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const other = yield* authenticatedAs(OTHER)
        const first = yield* api.lists.create()
        const second = yield* api.lists.create()
        yield* other.lists.create()
        yield* api.lists.addRecipe({ path: { id: second.id }, payload: { recipeId: yield* recipeId("Crêpes") } })

        const mine = yield* api.lists.list()
        expect(mine.map((l) => l.id)).toEqual([second.id, first.id])
        expect(mine[0]!.recipeCount).toBe(1)
        expect(mine[1]!.recipeCount).toBe(0)
        // Deux listes le même jour portent le même nom : c'est accepté.
        expect(mine[0]!.name).toBe(mine[1]!.name)
      }))

    it.effect("agrège les ingrédients par nom, les invariants au placard", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create()
        yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: yield* recipeId("Crêpes") } })
        const list = yield* api.lists.addRecipe({
          path: { id: created.id },
          payload: { recipeId: yield* recipeId("Gâteau") },
        })

        expect(list.recipes.map((r) => [r.title, r.count, r.imageUrl])).toEqual([
          ["Crêpes", 1, null],
          ["Gâteau", 1, `/recipes/${yield* recipeId("Gâteau")}/image`],
        ])
        expect(list.items.map((i) => [i.name, i.amount, i.unit, i.checked])).toEqual([
          ["farine", 220, "g", false],
          ["lait", 500, "ml", false],
          ["sel", 2, "g", false],
          ["sucre", 100, "g", false],
        ])
        expect(list.pantry.map((p) => p.name)).toEqual(["huile d'olive"])
      }))

    it.effect("met les quantités à l'échelle du nombre de personnes", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create()
        yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: yield* recipeId("Crêpes") } })

        const list = yield* api.lists.setServings({ path: { id: created.id }, payload: { servings: 5 } })
        expect(list.servings).toBe(5)
        expect(list.items.find((i) => i.name === "farine")!.amount).toBe(500)
        expect(list.items.find((i) => i.name === "lait")!.amount).toBe(1250)
      }))

    it.effect("laisse telles quelles les recettes sans nombre de portions : au placard", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create()
        const list = yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: yield* recipeId("Pain") } })
        expect(list.items).toEqual([])
        expect(list.pantry.map((p) => p.name)).toEqual(["farine"])
      }))

    it.effect("accepte deux fois la même recette : compte double, puis retire une occurrence", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create()
        const crepes = yield* recipeId("Crêpes")
        yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: crepes } })
        const twice = yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: crepes } })

        expect(twice.recipes).toEqual([{ recipeId: crepes, title: "Crêpes", imageUrl: null, count: 2 }])
        expect(twice.items.find((i) => i.name === "farine")!.amount).toBe(400)

        const once = yield* api.lists.removeRecipe({ path: { id: created.id, recipeId: crepes } })
        expect(once.recipes[0]!.count).toBe(1)
        expect(once.items.find((i) => i.name === "farine")!.amount).toBe(200)

        const none = yield* api.lists.removeRecipe({ path: { id: created.id, recipeId: crepes } })
        expect(none.recipes).toEqual([])
        expect(none.items).toEqual([])
      }))

    it.effect("refuse une recette inconnue", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create()
        const error = yield* api.lists
          .addRecipe({ path: { id: created.id }, payload: { recipeId: 99999 } })
          .pipe(Effect.flip)
        expect(tagOf(error)).toBe("RecipeNotFound")
      }))

    it.effect("la liste d'un autre est introuvable sur chaque endpoint", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const other = yield* authenticatedAs(OTHER)
        const theirs = yield* other.lists.create()
        const path = { id: theirs.id }
        const crepes = yield* recipeId("Crêpes")

        const attempts: ReadonlyArray<Effect.Effect<unknown, unknown>> = [
          api.lists.byId({ path }),
          api.lists.setServings({ path, payload: { servings: 4 } }),
          api.lists.remove({ path }),
          api.lists.addRecipe({ path, payload: { recipeId: crepes } }),
          api.lists.removeRecipe({ path: { ...path, recipeId: crepes } }),
          api.lists.setChecked({ path: { ...path, ingredientId: 1 }, payload: { checked: true } }),
        ]
        for (const attempt of attempts) {
          expect(tagOf(yield* Effect.flip(attempt))).toBe("ListNotFound")
        }
        // Et rien n'a bougé chez l'autre.
        const intact = yield* other.lists.byId({ path })
        expect(intact.servings).toBe(2)
        expect(intact.recipes).toEqual([])
      }))

    it.effect("une case cochée survit à l'ajout d'un plat et au changement de personnes", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create()
        const withCrepes = yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: yield* recipeId("Crêpes") } })
        const farine = withCrepes.items.find((i) => i.name === "farine")!
        const huile = withCrepes.pantry.find((p) => p.name === "huile d'olive")!

        yield* api.lists.setChecked({ path: { id: created.id, ingredientId: farine.ingredientId }, payload: { checked: true } })
        yield* api.lists.setChecked({ path: { id: created.id, ingredientId: huile.ingredientId }, payload: { checked: true } })

        yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: yield* recipeId("Gâteau") } })
        const after = yield* api.lists.setServings({ path: { id: created.id }, payload: { servings: 4 } })
        expect(after.items.find((i) => i.name === "farine")).toMatchObject({ amount: 440, checked: true })
        expect(after.items.find((i) => i.name === "sucre")).toMatchObject({ checked: false })
        expect(after.pantry.find((p) => p.name === "huile d'olive")).toMatchObject({ checked: true })

        yield* api.lists.setChecked({ path: { id: created.id, ingredientId: farine.ingredientId }, payload: { checked: false } })
        const unchecked = yield* api.lists.byId({ path: { id: created.id } })
        expect(unchecked.items.find((i) => i.name === "farine")!.checked).toBe(false)
      }))

    it.effect("supprimer une liste emporte ses plats et ses cases, pas les recettes", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create()
        const list = yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: yield* recipeId("Crêpes") } })
        yield* api.lists.setChecked({ path: { id: created.id, ingredientId: list.items[0]!.ingredientId }, payload: { checked: true } })

        yield* api.lists.remove({ path: { id: created.id } })

        expect(tagOf(yield* Effect.flip(api.lists.byId({ path: { id: created.id } })))).toBe("ListNotFound")
        const db = yield* PgDrizzle
        expect(yield* db.select().from(schema.shoppingListRecipes)).toEqual([])
        expect(yield* db.select().from(schema.shoppingListChecks)).toEqual([])
        expect(yield* db.select().from(schema.recipes)).toHaveLength(3)
      }))

    it.effect("rejette un nombre de personnes hors bornes", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create()
        const response = yield* fetchPath(`/lists/${created.id}`, {
          method: "PATCH",
          headers: { ...cookieHeader(yield* sessionToken), "content-type": "application/json" },
          body: JSON.stringify({ servings: 0 }),
        })
        expect(response.status).toBe(400)
      }))

    it.effect("exige une session", () =>
      Effect.gen(function* () {
        const response = yield* fetchPath("/lists")
        expect(response.status).toBe(401)
      }))
  })
})
