import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type RouterHistory,
} from "@tanstack/react-router"
import { ListPage } from "./routes/List.tsx"
import { DetailPage } from "./routes/Detail.tsx"
import { validateSearch } from "./search.ts"

const RootLayout = () => (
  <div className="min-h-screen bg-stone-50">
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <Link to="/" className="text-lg font-semibold text-stone-900">
          Recettes
        </Link>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Outlet />
    </main>
  </div>
)

/**
 * La validation est portée par la racine : les search params sont hérités le
 * long de l'arbre, et une racine qui ne valide rien recouvrirait le résultat
 * des routes filles par sa propre lecture brute de l'URL.
 */
const rootRoute = createRootRoute({ component: RootLayout, validateSearch })

export const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ListPage,
})

export const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recipes/$id",
  component: DetailPage,
})

export const routeTree = rootRoute.addChildren([listRoute, detailRoute])

/** L'historique se fournit à la construction : l'URL initiale y est analysée. */
export const createAppRouter = (history?: RouterHistory) =>
  createRouter(history === undefined ? { routeTree } : { routeTree, history })

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
