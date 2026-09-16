import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { assemble } from "../src/assemble.ts"
import { loadPages } from "../src/pdf.ts"

/** Les PDF vivent à la racine du dépôt, pas dans le package. */
const root = (file: string) => fileURLToPath(new URL(`../../../${file}`, import.meta.url))

/** Le filet parse 921 pages : hors de la boucle TDD, il a le droit d'être lent. */
const TIMEOUT = 120_000

const BOOKS = [
  { book: 1, path: root("list1.pdf"), pages: 500, recipes: 486, categories: 6 },
  { book: 2, path: root("list2.pdf"), pages: 421, recipes: 401, categories: 9 },
] as const

// Les PDF ne sont pas versionnés : hors de la machine qui les a, on saute.
const available = BOOKS.every((b) => existsSync(b.path))

describe.skipIf(!available)("corpus complet", () => {
  for (const book of BOOKS) {
    describe(`livre ${book.book}`, () => {
      const parsed = Effect.runPromise(
        loadPages(book.path, book.book).pipe(Effect.flatMap(assemble))
      )

      it("parse chaque page sans erreur", async () => {
        const { errors } = await parsed
        expect(errors.map((e) => e.message)).toEqual([])
      }, TIMEOUT)

      it(`produit ${book.recipes} recettes`, async () => {
        const { recipes } = await parsed
        expect(recipes).toHaveLength(book.recipes)
      }, TIMEOUT)

      it("donne à chaque recette un titre, des ingrédients et des instructions", async () => {
        const { recipes } = await parsed
        const vides = recipes.filter(
          (r) => r.title === "" || r.ingredients.length === 0 || r.instructions === ""
        )
        expect(vides.map((r) => `p${r.page} ${r.title}`)).toEqual([])
      }, TIMEOUT)

      it("n'attribue jamais deux recettes à la même page", async () => {
        const { recipes } = await parsed
        const pages = recipes.map((r) => r.page)
        expect(new Set(pages).size).toBe(pages.length)
      }, TIMEOUT)

      it(`classe les recettes dans ${book.categories} catégories`, async () => {
        const { recipes } = await parsed
        const categories = new Set(recipes.map((r) => r.category))
        expect(categories.has(null)).toBe(false)
        expect(categories.size).toBe(book.categories)
      }, TIMEOUT)
    })
  }
})
