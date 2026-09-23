import { useListsApi } from "../api.ts"
import { useShoppingList } from "../lists.ts"

interface Props {
  readonly listId: number
  readonly recipeId: number
}

/** « Ajouter » à la liste en cours de sélection, avec le nombre déjà mis. */
export const AddToList = ({ listId, recipeId }: Props) => {
  const lists = useListsApi()
  const { data, isError, mutate } = useShoppingList(listId)
  const count = data?.recipes.find((r) => r.recipeId === recipeId)?.count ?? 0

  // Liste supprimée entre-temps : le bandeau l'explique, pas de bouton orphelin.
  if (isError) return null

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => mutate(() => lists.addRecipe(listId, recipeId))}
        className="min-h-10 rounded-lg bg-stone-900 px-3 text-sm font-medium text-white hover:bg-stone-700"
      >
        Ajouter
      </button>
      {count > 0 && (
        <>
          <span className="text-sm text-stone-600" aria-label="déjà dans la liste">
            ×{count}
          </span>
          <button
            type="button"
            onClick={() => mutate(() => lists.removeRecipe(listId, recipeId))}
            aria-label="Retirer une fois"
            className="min-h-10 min-w-10 rounded-lg border border-stone-300 text-sm text-stone-700 hover:bg-stone-100"
          >
            −
          </button>
        </>
      )}
    </div>
  )
}
