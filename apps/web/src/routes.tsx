import { useQueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  type RouterHistory,
  useNavigate,
} from "@tanstack/react-router"
import { SelectionBanner } from "./components/SelectionBanner.tsx"
import { DetailPage } from "./routes/Detail.tsx"
import { ListPage } from "./routes/List.tsx"
import { ListsPage } from "./routes/Lists.tsx"
import { LoginPage } from "./routes/Login.tsx"
import { ShoppingListPage } from "./routes/ShoppingList.tsx"
import { validateSearch } from "./search.ts"
import type { Session } from "./session.ts"

interface RouterContext {
  readonly session: Session
}

/**
 * La validation est portée par la racine : les search params sont hérités le
 * long de l'arbre, et une racine qui ne valide rien recouvrirait le résultat
 * des routes filles par sa propre lecture brute de l'URL.
 */
const rootRoute = createRootRouteWithContext<RouterContext>()({ validateSearch })

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
})

/**
 * La garde : tout ce qui n'est pas /login exige une session. Sans elle, on
 * part vers /login en retenant la destination pour y revenir ensuite.
 */
export const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  beforeLoad: async ({ context, location }) => {
    const user = await context.session.current()
    if (user === null) throw redirect({ to: "/login", search: { redirect: location.href } })
    return { user }
  },
  component: () => <AuthenticatedLayout />,
})

const AuthenticatedLayout = () => {
  const { user, session } = authenticatedRoute.useRouteContext()
  const { list } = authenticatedRoute.useSearch()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Vider le cache après la déconnexion : les listes de courses seront par
  // utilisateur, et un autre compte ne doit pas hériter des données du premier.
  // Après la navigation : tant que la liste est montée, elle re-remplirait le cache.
  const logout = async () => {
    await session.logout()
    await navigate({ to: "/login" })
    queryClient.clear()
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <nav className="flex items-center gap-6">
            <Link
              to="/"
              // En mode sélection, revenir aux recettes garde la liste en cours.
              search={{ list }}
              className="text-lg font-semibold text-stone-900"
            >
              Recettes
            </Link>
            <Link
              to="/lists"
              className="text-sm text-stone-700 hover:underline [&.active]:font-medium"
            >
              Listes
            </Link>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-stone-500">{user.email}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-stone-300 px-3 py-1 text-stone-700 hover:bg-stone-100"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      {list !== undefined && <SelectionBanner listId={list} />}
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}

export const listRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  component: ListPage,
})

export const detailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/recipes/$id",
  component: DetailPage,
})

export const listsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/lists",
  component: ListsPage,
})

export const shoppingListRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/lists/$id",
  component: ShoppingListPage,
})

export const routeTree = rootRoute.addChildren([
  loginRoute,
  authenticatedRoute.addChildren([listRoute, detailRoute, listsRoute, shoppingListRoute]),
])

/** L'historique se fournit à la construction : l'URL initiale y est analysée. */
export const createAppRouter = (session: Session, history?: RouterHistory) =>
  createRouter({
    routeTree,
    context: { session },
    ...(history === undefined ? {} : { history }),
  })

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
