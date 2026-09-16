import type { ListQuery, Recipe, RecipeListPage, RecipeSummary } from "@recettes/contract"
import type { RecipesApi } from "../src/api.ts"

export interface FakeApi extends RecipesApi {
  /** Ce que l'interface a réellement demandé, dans l'ordre. */
  readonly calls: Array<ListQuery>
}

const summary = (over: Partial<RecipeSummary> = {}): RecipeSummary => ({
  id: 1,
  book: 1,
  page: 1,
  title: "Bowl de pastèque",
  category: "Salades & bowls",
  servings: 2,
  imageUrl: "/recipes/1/image",
  ...over,
})

export const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  ...summary(),
  instructions: "Couper les tomates.\n\nMélanger.",
  ingredients: [
    { name: "pastèque", quantity: "1/4", section: null, raw: "1/4 de pastèque" },
    { name: "feta", quantity: "60g", section: "Pour la garniture", raw: "60g de feta" },
  ],
  ...over,
})

/** Un port si étroit qu'un faux tient en quelques lignes — c'était l'intention. */
export const fakeApi = (page: Partial<RecipeListPage> = {}): FakeApi => {
  const calls: Array<ListQuery> = []
  const full: RecipeListPage = {
    items: [summary(), summary({ id: 2, title: "Curry de lentilles", imageUrl: null })],
    total: 2,
    limit: 20,
    offset: 0,
    ...page,
  }
  return {
    calls,
    list: (query) => {
      calls.push(query)
      return Promise.resolve(full)
    },
    byId: (id) => Promise.resolve(recipe({ id })),
  }
}

export { summary }
