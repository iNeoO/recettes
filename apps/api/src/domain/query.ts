import { DEFAULT_LIMIT, type Book, type ListQuery } from "@recettes/contract"

/** Requête finie : plus aucun champ de pagination indéterminé en aval. */
export interface RecipeQuery {
  readonly search: string | undefined
  readonly category: string | undefined
  readonly book: Book | undefined
  readonly limit: number
  readonly offset: number
}

export const normalize = (query: ListQuery): RecipeQuery => ({
  search: query.search,
  category: query.category,
  book: query.book,
  limit: query.limit ?? DEFAULT_LIMIT,
  offset: query.offset ?? 0,
})
