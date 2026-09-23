import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { ApiProvider, type RecipesApi, type ShoppingListApi } from "./api.ts"
import { createAppRouter } from "./routes.tsx"
import type { Session } from "./session.ts"

interface Props {
  readonly api: RecipesApi
  readonly lists: ShoppingListApi
  readonly session: Session
  readonly router?: ReturnType<typeof createAppRouter>
  readonly queryClient?: QueryClient
}

/**
 * L'API et la session arrivent par les props : les tests en fournissent des
 * factices, et rien dans l'arbre ne connaît fetch.
 */
export const App = ({
  api,
  lists,
  session,
  router = createAppRouter(session),
  queryClient,
}: Props) => (
  <QueryClientProvider client={queryClient ?? new QueryClient()}>
    <ApiProvider value={{ recipes: api, lists }}>
      <RouterProvider router={router} />
    </ApiProvider>
  </QueryClientProvider>
)
