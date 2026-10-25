import type {
  ListQuery,
  Recipe,
  RecipeListPage,
  RecipeSummary,
  ShoppingList,
  User,
} from "@recettes/contract"
import {
  type AuthApi,
  InvalidCredentials,
  ListMissing,
  type RecipesApi,
  type ShoppingListApi,
} from "../src/api.ts"

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

export interface FakeAuth extends AuthApi {
  /** Les identifiants reçus, dans l'ordre. */
  readonly logins: Array<{ email: string; password: string }>
  readonly logouts: { count: number }
}

export const user = (over: Partial<User> = {}): User => ({
  id: 1,
  email: "anne@example.org",
  ...over,
})

/**
 * Un faux serveur d'authentification : `me` rend l'utilisateur donné (null =
 * pas de session), `login` accepte un seul mot de passe.
 */
export const fakeAuth = (current: User | null = user(), password = "secret"): FakeAuth => {
  const logins: Array<{ email: string; password: string }> = []
  const logouts = { count: 0 }
  return {
    logins,
    logouts,
    me: () => Promise.resolve(current),
    login: (email, given) => {
      logins.push({ email, password: given })
      return given === password
        ? Promise.resolve(user({ email }))
        : Promise.reject(new InvalidCredentials())
    },
    logout: () => {
      logouts.count += 1
      return Promise.resolve()
    },
  }
}

export interface FakeLists extends ShoppingListApi {
  /** L'état des listes, tel que le faux serveur le tient. */
  readonly state: Map<number, ShoppingList>
  readonly calls: Array<string>
}

/** Une liste de courses complète, prête à afficher. */
export const shoppingList = (over: Partial<ShoppingList> = {}): ShoppingList => ({
  id: 3,
  name: "23 septembre 2026",
  servings: 2,
  status: "ready",
  createdAt: new Date("2026-09-23T10:00:00Z"),
  recipes: [
    { recipeId: 1, title: "Bowl de pastèque", imageUrl: "/recipes/1/image", count: 2 },
    { recipeId: 2, title: "Curry de lentilles", imageUrl: null, count: 1 },
  ],
  items: [
    { ingredientId: 10, name: "ail", amount: 1.5, unit: "gousse", checked: false },
    { ingredientId: 11, name: "farine", amount: 350, unit: "g", checked: false },
    { ingredientId: 12, name: "lait", amount: 1200, unit: "ml", checked: true },
    { ingredientId: 13, name: "oignon", amount: 3, unit: "pièce", checked: false },
  ],
  pantry: [{ ingredientId: 20, name: "huile d'olive", checked: false }],
  ...over,
})

/**
 * Un faux serveur de listes qui tient son état : ajouter une recette
 * l'incrémente, cocher persiste, supprimer efface. Les quantités ne sont pas
 * recalculées — ce n'est pas le rôle du front de le vérifier.
 */
export const fakeLists = (initial: ReadonlyArray<ShoppingList> = []): FakeLists => {
  const state = new Map(initial.map((list) => [list.id, list]))
  const calls: Array<string> = []
  let nextId = Math.max(0, ...state.keys()) + 1
  // Le hasard du faux est un compteur : « Plat tiré 1 », « Plat tiré 2 »…
  let drawn = 0
  const draw = () => {
    drawn += 1
    return { recipeId: 100 + drawn, title: `Plat tiré ${drawn}`, imageUrl: null, count: 1 }
  }

  const dish = (recipeId: number) => ({
    recipeId,
    title: `Recette ${recipeId}`,
    imageUrl: null,
    count: 1,
  })

  const get = (id: number) => {
    const list = state.get(id)
    if (list === undefined) throw new ListMissing()
    return list
  }
  const put = (list: ShoppingList) => {
    state.set(list.id, list)
    return Promise.resolve(list)
  }

  return {
    state,
    calls,
    list: () => {
      calls.push("list")
      return Promise.resolve(
        [...state.values()].map((l) => ({
          id: l.id,
          name: l.name,
          servings: l.servings,
          status: l.status,
          createdAt: l.createdAt,
          recipeCount: l.recipes.reduce((n, r) => n + r.count, 0),
        }))
      )
    },
    create: (meals) => {
      calls.push(`create ${meals}`)
      const recipes = Array.from({ length: meals }, draw)
      return put(shoppingList({ id: nextId++, status: "draft", recipes, items: [], pantry: [] }))
    },
    byId: (id) => {
      calls.push(`byId ${id}`)
      try {
        return Promise.resolve(get(id))
      } catch (error) {
        return Promise.reject(error)
      }
    },
    setServings: (id, servings) => {
      calls.push(`setServings ${id} ${servings}`)
      return put({ ...get(id), servings })
    },
    remove: (id) => {
      calls.push(`remove ${id}`)
      state.delete(id)
      return Promise.resolve()
    },
    finalize: (id) => {
      calls.push(`finalize ${id}`)
      return put({ ...get(id), status: "ready" })
    },
    reopen: (id) => {
      calls.push(`reopen ${id}`)
      return put({ ...get(id), status: "draft" })
    },
    addRecipe: (id, recipeId) => {
      calls.push(`addRecipe ${id} ${recipeId}`)
      const list = get(id)
      if (list.recipes.some((r) => r.recipeId === recipeId)) return put(list)
      return put({ ...list, recipes: [...list.recipes, dish(recipeId)] })
    },
    replaceRecipe: (id, recipeId, replacementId) => {
      calls.push(`replaceRecipe ${id} ${recipeId} ${replacementId}`)
      const list = get(id)
      const present = list.recipes.some((r) => r.recipeId === replacementId)
      const recipes = list.recipes.flatMap((r) => {
        if (r.recipeId !== recipeId) return [r]
        return present ? [] : [dish(replacementId)]
      })
      return put({ ...list, recipes })
    },
    removeRecipe: (id, recipeId) => {
      calls.push(`removeRecipe ${id} ${recipeId}`)
      const list = get(id)
      const recipes = list.recipes
        .map((r) => (r.recipeId === recipeId ? { ...r, count: r.count - 1 } : r))
        .filter((r) => r.count > 0)
      return put({ ...list, recipes })
    },
    setChecked: (id, ingredientId, checked) => {
      calls.push(`setChecked ${id} ${ingredientId} ${checked}`)
      const list = get(id)
      void put({
        ...list,
        items: list.items.map((i) => (i.ingredientId === ingredientId ? { ...i, checked } : i)),
        pantry: list.pantry.map((p) => (p.ingredientId === ingredientId ? { ...p, checked } : p)),
      })
      return Promise.resolve()
    },
  }
}
