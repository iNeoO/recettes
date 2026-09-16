import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { MAX_LIMIT } from "@recettes/contract"
import { client, fetchImage, fetchPath, TestServer } from "./harness.ts"
import { putTestObject } from "./storage.ts"
import { seed } from "./seed.ts"

describe("GET /recipes", () => {
  it.layer(TestServer)("liste", (it) => {
    it.effect("rend les recettes et leur nombre total", () =>
      Effect.gen(function* () {
        yield* seed([
          { book: 1, page: 1, title: "Bowl de pastèque" },
          { book: 1, page: 2, title: "Curry de lentilles" },
          { book: 2, page: 1, title: "Crème brûlée" },
        ])

        const api = yield* client
        const page = yield* api.recipes.list({ urlParams: {} })

        expect(page.total).toBe(3)
        expect(page.limit).toBe(20)
        expect(page.offset).toBe(0)
        expect(page.items.map((r) => r.title)).toEqual([
          "Bowl de pastèque",
          "Crème brûlée",
          "Curry de lentilles",
        ])
      }))

    it.effect("cherche dans le titre sans tenir compte des accents", () =>
      Effect.gen(function* () {
        yield* seed([
          { book: 1, page: 1, title: "Crème brûlée" },
          { book: 1, page: 2, title: "Curry de lentilles" },
          { book: 2, page: 1, title: "Pâtes au pesto" },
        ])

        const api = yield* client
        const page = yield* api.recipes.list({ urlParams: { search: "creme" } })

        expect(page.items.map((r) => r.title)).toEqual(["Crème brûlée"])
        expect(page.total).toBe(1)
      }))

    it.effect("cherche aussi dans les ingrédients", () =>
      Effect.gen(function* () {
        yield* seed([
          {
            book: 1,
            page: 1,
            title: "Salade d'été",
            ingredients: [{ name: "halloumi" }, { name: "roquette" }],
          },
          { book: 1, page: 2, title: "Curry", ingredients: [{ name: "oignon" }] },
        ])

        const api = yield* client
        const page = yield* api.recipes.list({ urlParams: { search: "halloumi" } })

        expect(page.items.map((r) => r.title)).toEqual(["Salade d'été"])
      }))

    it.effect("ne rend qu'une fois une recette dont plusieurs ingrédients correspondent", () =>
      Effect.gen(function* () {
        yield* seed([
          {
            book: 1,
            page: 1,
            title: "Gratin",
            ingredients: [{ name: "crème" }, { name: "crème liquide" }],
          },
        ])

        const api = yield* client
        const page = yield* api.recipes.list({ urlParams: { search: "creme" } })

        expect(page.items).toHaveLength(1)
        expect(page.total).toBe(1)
      }))

    it.effect("filtre par catégorie", () =>
      Effect.gen(function* () {
        yield* seed([
          { book: 1, page: 1, title: "Bowl", category: "Salades & bowls" },
          { book: 1, page: 2, title: "Tarte", category: "Tartes & quiches" },
          { book: 1, page: 3, title: "Buddha bowl", category: "Salades & bowls" },
        ])

        const api = yield* client
        const page = yield* api.recipes.list({
          urlParams: { category: "Salades & bowls" },
        })

        expect(page.items.map((r) => r.title)).toEqual(["Bowl", "Buddha bowl"])
        expect(page.total).toBe(2)
      }))

    it.effect("filtre par livre", () =>
      Effect.gen(function* () {
        yield* seed([
          { book: 1, page: 1, title: "Alpha" },
          { book: 2, page: 1, title: "Beta" },
          { book: 2, page: 2, title: "Gamma" },
        ])

        const api = yield* client
        const page = yield* api.recipes.list({ urlParams: { book: 2 } })

        expect(page.items.map((r) => r.title)).toEqual(["Beta", "Gamma"])
      }))

    it.effect("combine les filtres avec le search en ET, pas en OU", () =>
      Effect.gen(function* () {
        yield* seed([
          // Correspond au search mais pas au livre.
          { book: 1, page: 1, title: "Crème du livre 1" },
          // Correspond aux deux : le seul attendu.
          { book: 2, page: 1, title: "Crème du livre 2" },
          // Correspond au livre mais pas au search.
          { book: 2, page: 2, title: "Tarte du livre 2" },
        ])

        const api = yield* client
        const page = yield* api.recipes.list({
          urlParams: { search: "creme", book: 2 },
        })

        expect(page.items.map((r) => r.title)).toEqual(["Crème du livre 2"])
        expect(page.total).toBe(1)
      }))

    it.effect("respecte limit et offset", () =>
      Effect.gen(function* () {
        yield* seed(
          ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((title, i) => ({
            book: 1 as const,
            page: i + 1,
            title,
          }))
        )

        const api = yield* client
        const page = yield* api.recipes.list({ urlParams: { limit: 2, offset: 1 } })

        // Ordre alphabétique : Alpha, Beta, Delta, Epsilon, Gamma
        expect(page.items.map((r) => r.title)).toEqual(["Beta", "Delta"])
        expect(page.total).toBe(5)
        expect(page.limit).toBe(2)
        expect(page.offset).toBe(1)
      }))

    it.effect("ne doublonne ni n'oublie de recette entre les pages, à titres égaux", () =>
      Effect.gen(function* () {
        // Titres identiques : le cas où l'ordre serait ambigu sans départage
        // par id. Attention, ce test ne prouve pas le départage — sur si peu de
        // lignes Postgres rend un ordre stable même sans lui. Il fixe la
        // propriété attendue : parcourir les pages voit chaque recette une fois.
        yield* seed([
          { book: 1, page: 1, title: "Gratin" },
          { book: 1, page: 2, title: "Gratin" },
          { book: 1, page: 3, title: "Gratin" },
          { book: 1, page: 4, title: "Gratin" },
          { book: 1, page: 5, title: "Gratin" },
        ])

        const api = yield* client
        const seen: Array<number> = []
        for (let offset = 0; offset < 5; offset += 2) {
          const page = yield* api.recipes.list({ urlParams: { limit: 2, offset } })
          seen.push(...page.items.map((r) => r.id))
        }

        expect(seen).toHaveLength(5)
        expect(new Set(seen).size).toBe(5)
      }))
  })
})

describe("GET /recipes/:id", () => {
  it.layer(TestServer)("détail", (it) => {
    it.effect("rend les instructions et les ingrédients dans l'ordre imprimé", () =>
      Effect.gen(function* () {
        yield* seed([
          {
            book: 2,
            page: 42,
            title: "Salade à la mangue",
            category: "Salades & bowls",
            servings: 2,
            instructions: "Cuire le quinoa.\n\nMélanger.",
            ingredients: [
              { name: "quinoa", quantity: "100g", raw: "100g de quinoa" },
              { name: "mangue", quantity: "1", raw: "1 mangue" },
              { name: "orange", quantity: "1", section: "Pour la vinaigrette", raw: "1 orange" },
              { name: "sel", section: "Pour la vinaigrette", raw: "Sel, poivre" },
            ],
          },
        ])

        const api = yield* client
        const { items } = yield* api.recipes.list({ urlParams: {} })
        const recipe = yield* api.recipes.byId({ path: { id: items[0]!.id } })

        expect(recipe.title).toBe("Salade à la mangue")
        expect(recipe.book).toBe(2)
        expect(recipe.page).toBe(42)
        expect(recipe.servings).toBe(2)
        expect(recipe.instructions.split("\n\n")).toHaveLength(2)
        expect(recipe.ingredients).toEqual([
          { name: "quinoa", quantity: "100g", section: null, raw: "100g de quinoa" },
          { name: "mangue", quantity: "1", section: null, raw: "1 mangue" },
          { name: "orange", quantity: "1", section: "Pour la vinaigrette", raw: "1 orange" },
          { name: "sel", quantity: null, section: "Pour la vinaigrette", raw: "Sel, poivre" },
        ])
      }))

    it.effect("rend un même ingrédient sous le même nom dans deux recettes", () =>
      Effect.gen(function* () {
        // C'est l'objet de la normalisation : « huile d'olive » est une seule
        // entrée du référentiel, quelles que soient les quantités employées.
        yield* seed([
          {
            book: 1,
            page: 1,
            title: "Salade",
            ingredients: [
              { name: "huile d'olive", quantity: "2 cuillères à soupe", raw: "2 cuillères à soupe d'huile d'olive" },
            ],
          },
          {
            book: 1,
            page: 2,
            title: "Pâtes",
            ingredients: [
              { name: "huile d'olive", quantity: "50ml", raw: "50ml d'huile d'olive" },
            ],
          },
        ])

        const api = yield* client
        const { items } = yield* api.recipes.list({ urlParams: {} })
        const [salade, pates] = yield* Effect.all([
          api.recipes.byId({ path: { id: items[1]!.id } }),
          api.recipes.byId({ path: { id: items[0]!.id } }),
        ])

        expect(salade.ingredients[0]!.name).toBe(pates.ingredients[0]!.name)
        // La quantité, elle, reste propre à chaque recette.
        expect(salade.ingredients[0]!.quantity).toBe("2 cuillères à soupe")
        expect(pates.ingredients[0]!.quantity).toBe("50ml")
      }))

    it.effect("rend 404 pour une recette inconnue", () =>
      Effect.gen(function* () {
        yield* seed([])

        const api = yield* client
        const error = yield* api.recipes.byId({ path: { id: 999 } }).pipe(Effect.flip)

        expect(error._tag).toBe("RecipeNotFound")
      }))
  })
})

describe("GET /recipes/:id/image", () => {
  it.layer(TestServer)("image", (it) => {
    it.scoped("rend les octets stockés dans Garage, avec leur vrai type", () =>
      Effect.gen(function* () {
        const key = "test/pixel.png"
        const bytes = yield* putTestObject(key)
        yield* seed([{ book: 1, page: 1, title: "Avec photo", imageKey: key }])

        const api = yield* client
        const { items } = yield* api.recipes.list({ urlParams: {} })
        expect(items[0]!.imageUrl).toBe(`/recipes/${items[0]!.id}/image`)

        const response = yield* fetchImage(items[0]!.id)
        expect(response.status).toBe(200)
        // Le PNG doit sortir en image/png, pas en octet-stream ni en jpeg.
        expect(response.headers.get("content-type")).toBe("image/png")
        const received = new Uint8Array(yield* Effect.promise(() => response.arrayBuffer()))
        expect(received).toEqual(bytes)
      }))

    it.effect("rend 404 quand la recette n'a pas de photo", () =>
      Effect.gen(function* () {
        yield* seed([{ book: 1, page: 1, title: "Sans photo", imageKey: null }])

        const api = yield* client
        const { items } = yield* api.recipes.list({ urlParams: {} })
        const response = yield* fetchImage(items[0]!.id)

        expect(response.status).toBe(404)
      }))

    it.effect("rend un même ingrédient sous le même nom dans deux recettes", () =>
      Effect.gen(function* () {
        // C'est l'objet de la normalisation : « huile d'olive » est une seule
        // entrée du référentiel, quelles que soient les quantités employées.
        yield* seed([
          {
            book: 1,
            page: 1,
            title: "Salade",
            ingredients: [
              { name: "huile d'olive", quantity: "2 cuillères à soupe", raw: "2 cuillères à soupe d'huile d'olive" },
            ],
          },
          {
            book: 1,
            page: 2,
            title: "Pâtes",
            ingredients: [
              { name: "huile d'olive", quantity: "50ml", raw: "50ml d'huile d'olive" },
            ],
          },
        ])

        const api = yield* client
        const { items } = yield* api.recipes.list({ urlParams: {} })
        const [salade, pates] = yield* Effect.all([
          api.recipes.byId({ path: { id: items[1]!.id } }),
          api.recipes.byId({ path: { id: items[0]!.id } }),
        ])

        expect(salade.ingredients[0]!.name).toBe(pates.ingredients[0]!.name)
        // La quantité, elle, reste propre à chaque recette.
        expect(salade.ingredients[0]!.quantity).toBe("2 cuillères à soupe")
        expect(pates.ingredients[0]!.quantity).toBe("50ml")
      }))

    it.effect("rend 404 pour une recette inconnue", () =>
      Effect.gen(function* () {
        yield* seed([])
        const response = yield* fetchImage(999)
        expect(response.status).toBe(404)
      }))
  })
})

describe("validation des paramètres", () => {
  it.layer(TestServer)("bornes", (it) => {
    it.effect("rejette côté serveur un limit au-delà du plafond", () =>
      Effect.gen(function* () {
        yield* seed([{ book: 1, page: 1, title: "Bowl" }])

        // En requête brute : un appelant qui n'est pas le client typé.
        const response = yield* fetchPath(`/recipes?limit=${MAX_LIMIT + 1}`)

        expect(response.status).toBe(400)
      }))

    it.effect("rejette côté serveur un offset négatif", () =>
      Effect.gen(function* () {
        yield* seed([])
        const response = yield* fetchPath("/recipes?offset=-1")
        expect(response.status).toBe(400)
      }))

    it.effect("le client typé refuse avant même d'émettre la requête", () =>
      Effect.gen(function* () {
        const api = yield* client
        const error = yield* api.recipes
          .list({ urlParams: { limit: MAX_LIMIT + 1 } })
          .pipe(Effect.flip)

        expect(error._tag).toBe("ParseError")
      }))

    it.effect("accepte le plafond exact", () =>
      Effect.gen(function* () {
        yield* seed([{ book: 1, page: 1, title: "Bowl" }])

        const api = yield* client
        const page = yield* api.recipes.list({ urlParams: { limit: MAX_LIMIT } })

        expect(page.limit).toBe(MAX_LIMIT)
        expect(page.items).toHaveLength(1)
      }))
  })
})
