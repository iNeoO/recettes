import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useListsApi } from "../api.ts"
import { useAuthGuard } from "../auth-guard.ts"
import { listsKey } from "../lists.ts"

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" })

export const ListsPage = () => {
  const lists = useListsApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, isPending, isError, error } = useQuery({ queryKey: listsKey, queryFn: lists.list })
  useAuthGuard(error)
  const [confirming, setConfirming] = useState<number | null>(null)

  // Créer ouvre aussitôt le mode sélection sur les recettes.
  const create = useMutation({
    mutationFn: lists.create,
    onSuccess: async (list) => {
      await queryClient.invalidateQueries({ queryKey: listsKey })
      await navigate({ to: "/", search: { list: list.id } })
    },
  })

  const remove = useMutation({
    mutationFn: lists.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listsKey }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Listes de courses</h1>
        <button
          type="button"
          disabled={create.isPending}
          onClick={() => create.mutate()}
          className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          Créer une liste
        </button>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-red-700">
          Impossible de charger les listes.
        </p>
      ) : isPending ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : data.length === 0 ? (
        <p className="py-12 text-center text-stone-500">
          Aucune liste pour l'instant. Créer une liste, puis choisir des plats.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {data.map((list) => (
            <li key={list.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <Link to="/lists/$id" params={{ id: String(list.id) }} className="min-w-0 flex-1">
                <span className="font-medium text-stone-900">{list.name}</span>
                <span className="ml-3 text-sm text-stone-500">
                  {list.recipeCount} plat{list.recipeCount > 1 ? "s" : ""} · {list.servings} pers. ·{" "}
                  {dateFormat.format(list.createdAt)}
                </span>
              </Link>
              {confirming === list.id ? (
                <button
                  type="button"
                  onClick={() => remove.mutate(list.id)}
                  className="rounded-lg bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-800"
                >
                  Confirmer la suppression
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(list.id)}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Supprimer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
