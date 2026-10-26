import { DEFAULT_MEALS, MAX_MEALS } from "@recettes/contract"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useListsApi } from "../api.ts"
import { useAuthGuard } from "../auth-guard.ts"
import { listKey, listsKey } from "../lists.ts"

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" })

export const ListsPage = () => {
  const lists = useListsApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, isPending, isError, error } = useQuery({ queryKey: listsKey, queryFn: lists.list })
  useAuthGuard(error)
  const [confirming, setConfirming] = useState<number | null>(null)

  const [meals, setMeals] = useState(String(DEFAULT_MEALS))
  const parsed = Number(meals)
  const validMeals =
    meals !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_MEALS ? parsed : null

  const create = useMutation({
    mutationFn: lists.create,
    onSuccess: async (list) => {
      queryClient.setQueryData(listKey(list.id), list)
      await queryClient.invalidateQueries({ queryKey: listsKey })
      await navigate({ to: "/lists/$id/plats", params: { id: String(list.id) } })
    },
  })

  const remove = useMutation({
    mutationFn: lists.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listsKey }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-stone-900">Listes de courses</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (validMeals !== null) create.mutate(validMeals)
          }}
          className="flex shrink-0 items-center gap-2"
        >
          <label className="flex items-center gap-2 text-sm text-stone-600">
            Nombre de repas
            <input
              type="number"
              min={0}
              max={MAX_MEALS}
              value={meals}
              onChange={(event) => setMeals(event.target.value)}
              className="min-h-10 w-16 rounded-lg border border-stone-300 px-2 text-stone-900"
            />
          </label>
          <button
            type="submit"
            disabled={create.isPending || validMeals === null}
            className="min-h-10 rounded-lg bg-stone-900 px-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            Créer une liste
          </button>
        </form>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-red-700">
          Impossible de charger les listes.
        </p>
      ) : isPending ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : data.length === 0 ? (
        <p className="py-12 text-center text-stone-500">
          Aucune liste pour l'instant. Choisir un nombre de repas, puis les plats.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {data.map((list) => (
            <li key={list.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <Link to="/lists/$id" params={{ id: String(list.id) }} className="min-w-0 flex-1 py-1">
                <span className="flex items-center gap-2 font-medium text-stone-900">
                  {list.name}
                  {list.status === "draft" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">
                      Brouillon
                    </span>
                  )}
                </span>
                <span className="block text-sm text-stone-500">
                  {list.recipeCount} plat{list.recipeCount > 1 ? "s" : ""} · {list.servings} pers. ·{" "}
                  {dateFormat.format(list.createdAt)}
                </span>
              </Link>
              {confirming === list.id ? (
                <button
                  type="button"
                  onClick={() => remove.mutate(list.id)}
                  className="min-h-10 shrink-0 rounded-lg bg-red-700 px-3 text-sm text-white hover:bg-red-800"
                >
                  Confirmer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(list.id)}
                  className="min-h-10 shrink-0 rounded-lg border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-100"
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
