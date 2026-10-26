import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import {
  type ListQuery,
  ListNotFound,
  type Recipe,
  type RecipeListPage,
  type RecipeSummary,
  RecettesApi,
  type ShoppingList,
  type ShoppingListSummary,
  Unauthorized,
  type User,
} from "@recettes/contract"
import { Cause, Effect, Exit, Option, Redacted } from "effect"
import { createContext, useContext } from "react"

/** Le serveur a répondu 401 : pas de session, ou plus. */
export class Unauthenticated extends Error {
  override readonly name = "Unauthenticated"
}

/** Le login a répondu 401 : identifiants refusés. */
export class InvalidCredentials extends Error {
  override readonly name = "InvalidCredentials"
}

/** La liste n'existe pas, ou n'est pas à nous : le serveur ne distingue pas. */
export class ListMissing extends Error {
  override readonly name = "ListMissing"
}

/**
 * Ce dont l'interface a besoin, et rien de plus.
 *
 * Un port étroit, comme RecipeRepository côté serveur : les tests en fournissent
 * une implémentation factice sans avoir à imiter tout HttpApiClient.
 * Les deux méthodes rejettent Unauthenticated sur un 401.
 */
export interface RecipesApi {
  readonly list: (query: ListQuery) => Promise<RecipeListPage>
  readonly byId: (id: number) => Promise<Recipe>
}

/** L'authentification, port distinct : il change pour d'autres raisons. */
export interface AuthApi {
  /** null sans session valide, jamais un rejet. */
  readonly me: () => Promise<User | null>
  /** Rejette InvalidCredentials sur un 401. Le cookie est posé par le serveur. */
  readonly login: (email: string, password: string) => Promise<User>
  readonly logout: () => Promise<void>
}

/**
 * Les listes de courses, troisième port. Toute mutation rend la liste complète :
 * une seule requête à rafraîchir côté cache.
 */
export interface ShoppingListApi {
  readonly list: () => Promise<ReadonlyArray<ShoppingListSummary>>
  /** Crée la liste avec `meals` plats tirés au hasard par le serveur. */
  readonly create: (meals: number) => Promise<ShoppingList>
  /** Rejette ListMissing sur un 404. */
  readonly byId: (id: number) => Promise<ShoppingList>
  readonly setServings: (id: number, servings: number) => Promise<ShoppingList>
  readonly remove: (id: number) => Promise<void>
  /** Des plats au hasard, hors ceux de la liste. */
  readonly suggestions: (id: number) => Promise<ReadonlyArray<RecipeSummary>>
  readonly finalize: (id: number) => Promise<ShoppingList>
  readonly reopen: (id: number) => Promise<ShoppingList>
  readonly addRecipe: (id: number, recipeId: number) => Promise<ShoppingList>
  readonly removeRecipe: (id: number, recipeId: number) => Promise<ShoppingList>
  /** Remplace une occurrence par le plat choisi, à la même place. */
  readonly replaceRecipe: (id: number, recipeId: number, replacementId: number) => Promise<ShoppingList>
  readonly setChecked: (id: number, ingredientId: number, checked: boolean) => Promise<void>
}

/** Le proxy Vite renvoie /api vers le serveur : on reste en même origine. */
export const API_BASE = "/api"

/** Préfixe le chemin d'image rendu par l'API, seul endroit où une URL se fabrique. */
export const imageSrc = (imageUrl: string): string => `${API_BASE}${imageUrl}`

/**
 * runPromise enveloppe les échecs dans une FiberFailure ; on lit l'Exit pour
 * rendre un 401 reconnaissable par `instanceof` côté React.
 */
const run = <A, E>(effect: Effect.Effect<A, E>, onUnauthorized: () => Error): Promise<A> =>
  Effect.runPromiseExit(effect).then(
    Exit.match({
      onSuccess: (value) => value,
      onFailure: (cause) => {
        const failure = Cause.failureOption(cause)
        if (Option.isSome(failure) && failure.value instanceof Unauthorized) throw onUnauthorized()
        if (Option.isSome(failure) && failure.value instanceof ListNotFound) throw new ListMissing()
        throw Cause.squash(cause)
      },
    })
  )

/** Les adaptateurs : le client engendré par le contrat, réduit aux ports ci-dessus. */
export const makeClients = async (
  baseUrl = API_BASE
): Promise<{ recipes: RecipesApi; auth: AuthApi; lists: ShoppingListApi }> => {
  const client = await Effect.runPromise(
    HttpApiClient.make(RecettesApi, { baseUrl }).pipe(Effect.provide(FetchHttpClient.layer))
  )
  const unauthenticated = () => new Unauthenticated()
  return {
    recipes: {
      list: (query) => run(client.recipes.list({ urlParams: query }), unauthenticated),
      byId: (id) => run(client.recipes.byId({ path: { id } }), unauthenticated),
    },
    auth: {
      me: () =>
        run(client.auth.me(), unauthenticated).then(
          (user) => user,
          (error: unknown) => {
            if (error instanceof Unauthenticated) return null
            throw error
          }
        ),
      login: (email, password) =>
        run(
          client.auth.login({ payload: { email, password: Redacted.make(password) } }),
          () => new InvalidCredentials()
        ),
      logout: () => run(client.auth.logout(), unauthenticated),
    },
    lists: {
      list: () => run(client.lists.list(), unauthenticated),
      create: (meals) => run(client.lists.create({ payload: { meals } }), unauthenticated),
      byId: (id) => run(client.lists.byId({ path: { id } }), unauthenticated),
      setServings: (id, servings) =>
        run(client.lists.setServings({ path: { id }, payload: { servings } }), unauthenticated),
      remove: (id) => run(client.lists.remove({ path: { id } }), unauthenticated),
      suggestions: (id) =>
        run(client.lists.suggestions({ path: { id }, urlParams: {} }), unauthenticated),
      finalize: (id) => run(client.lists.finalize({ path: { id } }), unauthenticated),
      reopen: (id) => run(client.lists.reopen({ path: { id } }), unauthenticated),
      addRecipe: (id, recipeId) =>
        run(client.lists.addRecipe({ path: { id }, payload: { recipeId } }), unauthenticated),
      removeRecipe: (id, recipeId) =>
        run(client.lists.removeRecipe({ path: { id, recipeId } }), unauthenticated),
      replaceRecipe: (id, recipeId, replacementId) =>
        run(
          client.lists.replaceRecipe({ path: { id, recipeId }, payload: { recipeId: replacementId } }),
          unauthenticated
        ),
      setChecked: (id, ingredientId, checked) =>
        run(
          client.lists.setChecked({ path: { id, ingredientId }, payload: { checked } }),
          unauthenticated
        ),
    },
  }
}

export interface Clients {
  readonly recipes: RecipesApi
  readonly lists: ShoppingListApi
}

const ApiContext = createContext<Clients | null>(null)

export const ApiProvider = ApiContext.Provider

const useClients = (): Clients => {
  const clients = useContext(ApiContext)
  if (clients === null) throw new Error("ApiProvider manquant au-dessus de ce composant")
  return clients
}

export const useApi = (): RecipesApi => useClients().recipes
export const useListsApi = (): ShoppingListApi => useClients().lists
