import type { ListQuery } from "@recettes/contract"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useApi } from "../api.ts"
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
  const { data, isPending, isError } = useQuery({
    queryKey: ["recipes", search],
    queryFn: () => api.list(search),
  })

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
