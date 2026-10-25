import type { ListItem, PantryItem } from "@recettes/contract"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, Navigate, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { ListMissing, useListsApi } from "../api.ts"
import { useAuthGuard } from "../auth-guard.ts"
import { listKey, listsKey, useShoppingList } from "../lists.ts"
import { formatAmount } from "../quantity.ts"
import { shoppingListRoute } from "../routes.tsx"

export const ShoppingListPage = () => {
  const { id } = shoppingListRoute.useParams()
  const listId = Number(id)
  const lists = useListsApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, isPending, isError, error, mutate, pending } = useShoppingList(listId)
  useAuthGuard(error)
  const [confirming, setConfirming] = useState(false)

  // Cocher est optimiste : au magasin, on n'attend pas le serveur.
  const check = useMutation({
    mutationFn: ({ ingredientId, checked }: { ingredientId: number; checked: boolean }) =>
      lists.setChecked(listId, ingredientId, checked),
    onMutate: ({ ingredientId, checked }) => {
      queryClient.setQueryData(listKey(listId), (current: typeof data) =>
        current === undefined
          ? current
          : {
              ...current,
              items: current.items.map((i) => (i.ingredientId === ingredientId ? { ...i, checked } : i)),
              pantry: current.pantry.map((p) => (p.ingredientId === ingredientId ? { ...p, checked } : p)),
            }
      )
    },
    onError: () => queryClient.invalidateQueries({ queryKey: listKey(listId) }),
  })

  const remove = useMutation({
    mutationFn: () => lists.remove(listId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: listsKey })
      await navigate({ to: "/lists" })
    },
  })

  if (isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {error instanceof ListMissing ? "Cette liste est introuvable." : "Impossible de charger la liste."}
      </p>
    )
  }
  if (isPending) return <p className="text-sm text-stone-500">Chargement…</p>
  if (data.status === "draft") return <Navigate to="/lists/$id/plats" params={{ id }} replace />

  const setServings = (servings: number) => {
    if (servings < 1 || servings > 50) return
    mutate(() => lists.setServings(listId, servings))
  }

  const Check = ({ item }: { readonly item: ListItem | PantryItem }) => (
    // Assez haut pour un pouce au magasin.
    <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(event) =>
          check.mutate({ ingredientId: item.ingredientId, checked: event.target.checked })
        }
        className="size-5 shrink-0 accent-stone-900"
      />
      <span className={item.checked ? "text-stone-400 line-through" : "text-stone-800"}>
        {"amount" in item && (
          <span className="mr-2 inline-block w-20 text-stone-500">
            {formatAmount(item.amount, item.unit)}
          </span>
        )}
        {item.name}
      </span>
    </label>
  )

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">
            <Link to="/lists" className="hover:underline">
              Listes de courses
            </Link>
          </p>
          <h1 className="text-2xl font-semibold text-stone-900">{data.name}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-stone-600">Pour</span>
          <button
            type="button"
            aria-label="Une personne de moins"
            onClick={() => setServings(data.servings - 1)}
            className="min-h-10 min-w-10 rounded-lg border border-stone-300 hover:bg-stone-100"
          >
            −
          </button>
          <span className="w-6 text-center font-medium" aria-label="Nombre de personnes">
            {data.servings}
          </span>
          <button
            type="button"
            aria-label="Une personne de plus"
            onClick={() => setServings(data.servings + 1)}
            className="min-h-10 min-w-10 rounded-lg border border-stone-300 hover:bg-stone-100"
          >
            +
          </button>
          <span className="text-stone-600">personne{data.servings > 1 ? "s" : ""}</span>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-stone-900">Plats</h2>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              mutate(() => lists.reopen(listId), {
                onSuccess: () => void navigate({ to: "/lists/$id/plats", params: { id } }),
              })
            }
            className="min-h-10 rounded-lg border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            Modifier les plats
          </button>
        </div>
        {data.recipes.length === 0 ? (
          <p className="text-sm text-stone-500">Aucun plat pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {data.recipes.map((recipe) => (
              <li key={recipe.recipeId} className="px-4 py-2">
                <Link
                  to="/recipes/$id"
                  params={{ id: String(recipe.recipeId) }}
                  className="text-stone-900 hover:underline"
                >
                  {recipe.title}
                  {recipe.count > 1 && <span className="ml-2 text-stone-500">×{recipe.count}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-medium text-stone-900">À acheter</h2>
          {data.items.length === 0 ? (
            <p className="text-sm text-stone-500">Rien à peser ni à compter.</p>
          ) : (
            <ul className="text-sm">
              {data.items.map((item) => (
                <li key={`${item.ingredientId}-${item.unit}`}>
                  <Check item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-2 font-medium text-stone-900">Placard</h2>
          {data.pantry.length === 0 ? (
            <p className="text-sm text-stone-500">Rien.</p>
          ) : (
            <ul className="text-sm">
              {data.pantry.map((item) => (
                <li key={item.ingredientId}>
                  <Check item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="border-t border-stone-200 pt-4">
        {confirming ? (
          <button
            type="button"
            onClick={() => remove.mutate()}
            className="min-h-10 rounded-lg bg-red-700 px-3 text-sm text-white hover:bg-red-800"
          >
            Confirmer la suppression
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="min-h-10 text-sm text-stone-500 hover:text-red-700 hover:underline"
          >
            Supprimer cette liste
          </button>
        )}
      </footer>
    </div>
  )
}
