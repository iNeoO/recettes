import type { ListQuery } from "@recettes/contract"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useApi } from "../api.ts"
import { useAuthGuard } from "../auth-guard.ts"
import { Filters } from "../components/Filters.tsx"
import { Pagination } from "../components/Pagination.tsx"
import { RecipeCard } from "../components/RecipeCard.tsx"
import { listRoute } from "../routes.tsx"

export const ListPage = () => {
  const search = listRoute.useSearch()
  const navigate = useNavigate({ from: listRoute.fullPath })
  const api = useApi()

  // La clé, c'est l'URL : revenir d'une recette réaffiche la page depuis le
  // cache, sans requête ni clignotement.
  const { redirect: _redirect, ...query } = search
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["recipes", query],
    queryFn: () => api.list(query),
  })
  useAuthGuard(error)

  const setSearch = (next: ListQuery) => navigate({ search: next })

  return (
    <div className="space-y-6">
      <Filters value={search} onChange={setSearch} />

      {isError ? (
        <p role="alert" className="text-sm text-red-700">
          Impossible de charger les recettes.
        </p>
      ) : isPending ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : data.total === 0 ? (
        <p className="py-12 text-center text-stone-500">
          Aucune recette ne correspond à ces filtres.
        </p>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            {data.total} recette{data.total > 1 ? "s" : ""}
          </p>
          {/* Deux colonnes dès le téléphone : une seule ferait défiler 20 grandes photos. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {data.items.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          <Pagination
            total={data.total}
            limit={data.limit}
            offset={data.offset}
            onOffset={(offset) => setSearch({ ...search, offset })}
          />
        </>
      )}
    </div>
  )
}
