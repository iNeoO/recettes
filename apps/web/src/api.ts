import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import {
  type ListQuery,
  type Recipe,
  type RecipeListPage,
  RecettesApi,
} from "@recettes/contract"
import { Effect } from "effect"
import { createContext, useContext } from "react"

/**
 * Ce dont l'interface a besoin, et rien de plus.
 *
 * Un port étroit, comme RecipeRepository côté serveur : les tests en fournissent
 * une implémentation factice sans avoir à imiter tout HttpApiClient.
 */
export interface RecipesApi {
  readonly list: (query: ListQuery) => Promise<RecipeListPage>
  readonly byId: (id: number) => Promise<Recipe>
}

/** Le proxy Vite renvoie /api vers le serveur : on reste en même origine. */
export const API_BASE = "/api"

/** Préfixe le chemin d'image rendu par l'API, seul endroit où une URL se fabrique. */
export const imageSrc = (imageUrl: string): string => `${API_BASE}${imageUrl}`

/** L'adaptateur : le client engendré par le contrat, réduit au port ci-dessus. */
export const makeApi = async (baseUrl = API_BASE): Promise<RecipesApi> => {
  const client = await Effect.runPromise(
    HttpApiClient.make(RecettesApi, { baseUrl }).pipe(Effect.provide(FetchHttpClient.layer))
  )
  return {
    list: (query) => Effect.runPromise(client.recipes.list({ urlParams: query })),
    byId: (id) => Effect.runPromise(client.recipes.byId({ path: { id } })),
  }
}

const ApiContext = createContext<RecipesApi | null>(null)

export const ApiProvider = ApiContext.Provider

export const useApi = (): RecipesApi => {
  const api = useContext(ApiContext)
  if (api === null) throw new Error("ApiProvider manquant au-dessus de ce composant")
  return api
}
