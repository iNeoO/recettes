import { Effect } from "effect"
import { parsePage } from "./parser/index.ts"
import { ParseError } from "./parser/types.ts"
import type { Ingredient, PageInput } from "./parser/types.ts"

export interface Recipe {
  readonly book: number
  readonly page: number
  /** Toutes les pages occupées : la photo peut être sur la continuation. */
  readonly pages: ReadonlyArray<number>
  readonly title: string
  readonly category: string | null
  readonly servings: number | null
  readonly instructions: string
  readonly ingredients: ReadonlyArray<Ingredient>
}

export interface BookResult {
  readonly recipes: ReadonlyArray<Recipe>
  readonly errors: ReadonlyArray<ParseError>
}

/**
 * Déroule un livre page par page : les pages séparatrices fixent la catégorie
 * courante, et une recette qui déborde poursuit la précédente.
 */
export const assemble = (
  pages: ReadonlyArray<PageInput>
): Effect.Effect<BookResult> =>
  Effect.gen(function* () {
    const [errors, parsed] = yield* Effect.partition(pages, (page) =>
      parsePage(page).pipe(Effect.map((result) => ({ page, result })))
    )

    const recipes: Array<Recipe> = []
    const orphans: Array<ParseError> = []
    let category: string | null = null

    for (const { page, result } of parsed) {
      switch (result.kind) {
        case "divider":
          category = result.category
          break
        case "recipe":
          recipes.push({
            book: page.book,
            page: page.page,
            pages: [page.page],
            title: result.title,
            category,
            servings: result.servings,
            instructions: result.instructions,
            ingredients: result.ingredients,
          })
          break
        case "continuation": {
          const previous = recipes.at(-1)
          if (previous === undefined) {
            orphans.push(
              new ParseError({
                book: page.book,
                page: page.page,
                reason: "continuation sans recette précédente",
              })
            )
            break
          }
          recipes[recipes.length - 1] = {
            ...previous,
            pages: [...previous.pages, page.page],
            instructions: `${previous.instructions}\n\n${result.instructions}`,
          }
        }
      }
    }

    return { recipes, errors: [...errors, ...orphans] }
  })
