import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { ApiProvider, type RecipesApi } from "./api.ts"
import { createAppRouter } from "./routes.tsx"

interface Props {
  readonly api: RecipesApi
  readonly router?: ReturnType<typeof createAppRouter>
  readonly queryClient?: QueryClient
}

/**
 * L'API arrive par les props : les tests en fournissent une factice, et rien
 * dans l'arbre ne connaît fetch.
 */
export const App = ({ api, router = createAppRouter(), queryClient }: Props) => (
  <QueryClientProvider client={queryClient ?? new QueryClient()}>
    <ApiProvider value={api}>
      <RouterProvider router={router} />
    </ApiProvider>
  </QueryClientProvider>
)
