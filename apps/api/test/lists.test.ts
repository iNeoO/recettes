import { describe, expect, it } from "@effect/vitest"
import { PgDrizzle, schema } from "@recettes/db"
import { Effect } from "effect"
import { listName } from "../src/domain/shopping-lists.ts"
import { authenticated, authenticatedAs, cookieHeader, fetchPath, sessionToken, TestServer } from "./harness.ts"
import { seed } from "./seed.ts"

const OTHER = { email: "bob@example.org", password: "another horse battery" }

/** Une liste vide : le tirage n'est pas l'objet de ces tests. */
const EMPTY = { payload: { meals: 0 } }

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
        const list = yield* api.lists.create(EMPTY)

        expect(list.name).toBe(listName(Date.now()))
        expect(list.servings).toBe(2)
        expect(list.status).toBe("draft")
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
        const first = yield* api.lists.create(EMPTY)
        const second = yield* api.lists.create(EMPTY)
        yield* other.lists.create(EMPTY)
        yield* api.lists.addRecipe({ path: { id: second.id }, payload: { recipeId: yield* recipeId("Crêpes") } })

        const mine = yield* api.lists.list()
        expect(mine.map((l) => l.id)).toEqual([second.id, first.id])
        expect(mine[0]!.recipeCount).toBe(1)
        expect(mine[1]!.recipeCount).toBe(0)
        expect(mine[0]!.status).toBe("draft")
        // Deux listes le même jour portent le même nom : c'est accepté.
        expect(mine[0]!.name).toBe(mine[1]!.name)
      }))

    it.effect("agrège les ingrédients par nom, les invariants au placard", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
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
        const created = yield* api.lists.create(EMPTY)
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
        const created = yield* api.lists.create(EMPTY)
        const list = yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: yield* recipeId("Pain") } })
        expect(list.items).toEqual([])
        expect(list.pantry.map((p) => p.name)).toEqual(["farine"])
      }))

    it.effect("ajouter une recette déjà présente ne la double pas ; la retirer la retire", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
        const crepes = yield* recipeId("Crêpes")
        yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: crepes } })
        const twice = yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: crepes } })

        expect(twice.recipes).toEqual([{ recipeId: crepes, title: "Crêpes", imageUrl: null, count: 1 }])
        expect(twice.items.find((i) => i.name === "farine")!.amount).toBe(200)

        const none = yield* api.lists.removeRecipe({ path: { id: created.id, recipeId: crepes } })
        expect(none.recipes).toEqual([])
        expect(none.items).toEqual([])
      }))

    it.effect("refuse une recette inconnue", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
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
        const theirs = yield* other.lists.create(EMPTY)
        const path = { id: theirs.id }
        const crepes = yield* recipeId("Crêpes")

        const attempts: ReadonlyArray<Effect.Effect<unknown, unknown>> = [
          api.lists.byId({ path }),
          api.lists.setServings({ path, payload: { servings: 4 } }),
          api.lists.remove({ path }),
          api.lists.addRecipe({ path, payload: { recipeId: crepes } }),
          api.lists.removeRecipe({ path: { ...path, recipeId: crepes } }),
          api.lists.finalize({ path }),
          api.lists.reopen({ path }),
          api.lists.replaceRecipe({ path: { ...path, recipeId: crepes }, payload: { recipeId: crepes } }),
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

    it.effect("valide une liste puis la rouvre, cases cochées comprises", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
        const path = { id: created.id }
        const withCrepes = yield* api.lists.addRecipe({ path, payload: { recipeId: yield* recipeId("Crêpes") } })
        const farine = withCrepes.items.find((i) => i.name === "farine")!
        yield* api.lists.setChecked({ path: { ...path, ingredientId: farine.ingredientId }, payload: { checked: true } })

        const ready = yield* api.lists.finalize({ path })
        expect(ready.status).toBe("ready")
        expect((yield* api.lists.list())[0]!.status).toBe("ready")

        const draft = yield* api.lists.reopen({ path })
        expect(draft.status).toBe("draft")
        expect(draft.items.find((i) => i.name === "farine")!.checked).toBe(true)
      }))

    it.effect("refuse de valider une liste sans plat", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
        expect(tagOf(yield* Effect.flip(api.lists.finalize({ path: { id: created.id } })))).toBe("EmptyList")
        expect((yield* api.lists.byId({ path: { id: created.id } })).status).toBe("draft")
      }))

    it.effect("une liste validée refuse qu'on touche à ses plats, pas aux personnes ni aux cases", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
        const path = { id: created.id }
        const crepes = yield* recipeId("Crêpes")
        const list = yield* api.lists.addRecipe({ path, payload: { recipeId: crepes } })
        yield* api.lists.finalize({ path })

        const attempts: ReadonlyArray<Effect.Effect<unknown, unknown>> = [
          api.lists.addRecipe({ path, payload: { recipeId: yield* recipeId("Gâteau") } }),
          api.lists.removeRecipe({ path: { ...path, recipeId: crepes } }),
          api.lists.replaceRecipe({
            path: { ...path, recipeId: crepes },
            payload: { recipeId: yield* recipeId("Gâteau") },
          }),
        ]
        for (const attempt of attempts) {
          expect(tagOf(yield* Effect.flip(attempt))).toBe("ListNotDraft")
        }

        yield* api.lists.setChecked({
          path: { ...path, ingredientId: list.items[0]!.ingredientId },
          payload: { checked: true },
        })
        const after = yield* api.lists.setServings({ path, payload: { servings: 4 } })
        expect(after.servings).toBe(4)
        expect(after.items[0]!.checked).toBe(true)
        expect(after.recipes.map((r) => r.title)).toEqual(["Crêpes"])
      }))

    it.effect("une case cochée survit à l'ajout d'un plat et au changement de personnes", () =>
      Effect.gen(function* () {
        yield* corpus()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
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
        const created = yield* api.lists.create(EMPTY)
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
        const created = yield* api.lists.create(EMPTY)
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

  /** Deux plats salés ; tout le reste est hors du tirage. */
  const meals = () =>
    seed([
      {
        book: 1,
        page: 1,
        title: "Curry",
        category: "Currys & plats en sauce",
        ingredients: [{ name: "lait de coco", quantity: "40cl", amount: 400, unit: "ml" }, { name: "sel" }],
      },
      {
        book: 1,
        page: 2,
        title: "Quiche",
        category: "Tartes & quiches",
        ingredients: [{ name: "farine", quantity: "200g", amount: 200, unit: "g" }, { name: "sel" }],
      },
      { book: 2, page: 1, title: "Cookies", category: "Recettes sucrées" },
      { book: 2, page: 2, title: "Smoothie", category: "Boissons" },
      { book: 2, page: 3, title: "Baguette", category: "Pains & boulanges" },
      { book: 2, page: 4, title: "Houmous", category: "Apéritifs /collations & petits-déjeuners salés" },
    ])

  const occurrences = (list: { recipes: ReadonlyArray<{ title: string; count: number }> }) =>
    list.recipes.reduce((total, recipe) => total + recipe.count, 0)

  it.layer(TestServer)("tirage", (it) => {
    it.effect("tire N plats distincts parmi les plats salés", () =>
      Effect.gen(function* () {
        yield* meals()
        const api = yield* authenticated
        const one = yield* api.lists.create({ payload: { meals: 1 } })
        expect(occurrences(one)).toBe(1)
        expect(["Curry", "Quiche"]).toContain(one.recipes[0]!.title)

        // Plus de repas demandés que de plats salés : chacun une fois, pas de doublon.
        const all = yield* api.lists.create({ payload: { meals: 8 } })
        expect(all.recipes.map((r) => [r.title, r.count]).sort()).toEqual([
          ["Curry", 1],
          ["Quiche", 1],
        ])
      }))

    it.effect("remplace un plat par celui choisi, à la même place, sans toucher aux cases", () =>
      Effect.gen(function* () {
        yield* meals()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
        const curry = yield* recipeId("Curry")
        const path = { id: created.id }
        yield* api.lists.addRecipe({ path, payload: { recipeId: curry } })
        const before = yield* api.lists.addRecipe({ path, payload: { recipeId: yield* recipeId("Cookies") } })
        const sel = before.pantry.find((p) => p.name === "sel")!
        yield* api.lists.setChecked({ path: { ...path, ingredientId: sel.ingredientId }, payload: { checked: true } })

        const after = yield* api.lists.replaceRecipe({
          path: { ...path, recipeId: curry },
          payload: { recipeId: yield* recipeId("Quiche") },
        })

        expect(after.recipes.map((r) => r.title)).toEqual(["Quiche", "Cookies"])
        expect(after.pantry.find((p) => p.name === "sel")!.checked).toBe(true)
      }))

    it.effect("remplacer un plat absent de la liste ne change rien", () =>
      Effect.gen(function* () {
        yield* meals()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
        const list = yield* api.lists.replaceRecipe({
          path: { id: created.id, recipeId: yield* recipeId("Curry") },
          payload: { recipeId: yield* recipeId("Quiche") },
        })
        expect(list.recipes).toEqual([])
      }))

    it.effect("remplacer par un plat déjà présent le garde une seule fois", () =>
      Effect.gen(function* () {
        yield* meals()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
        const path = { id: created.id }
        const curry = yield* recipeId("Curry")
        const quiche = yield* recipeId("Quiche")
        yield* api.lists.addRecipe({ path, payload: { recipeId: curry } })
        yield* api.lists.addRecipe({ path, payload: { recipeId: quiche } })

        const list = yield* api.lists.replaceRecipe({ path: { ...path, recipeId: curry }, payload: { recipeId: quiche } })
        expect(list.recipes.map((r) => [r.title, r.count])).toEqual([["Quiche", 1]])
      }))

    it.effect("refuse un remplaçant inconnu", () =>
      Effect.gen(function* () {
        yield* meals()
        const api = yield* authenticated
        const created = yield* api.lists.create(EMPTY)
        const curry = yield* recipeId("Curry")
        yield* api.lists.addRecipe({ path: { id: created.id }, payload: { recipeId: curry } })
        const error = yield* api.lists
          .replaceRecipe({ path: { id: created.id, recipeId: curry }, payload: { recipeId: 99999 } })
          .pipe(Effect.flip)
        expect(tagOf(error)).toBe("RecipeNotFound")
      }))

    it.effect("rejette un nombre de repas hors bornes", () =>
      Effect.gen(function* () {
        yield* meals()
        const token = yield* sessionToken
        for (const count of [-1, 22, 2.5]) {
          const response = yield* fetchPath("/lists", {
            method: "POST",
            headers: { ...cookieHeader(token), "content-type": "application/json" },
            body: JSON.stringify({ meals: count }),
          })
          expect(response.status).toBe(400)
        }
      }))
  })
})
