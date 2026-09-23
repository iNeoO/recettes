import { useListsApi } from "../api.ts"
import { useShoppingList } from "../lists.ts"

interface Props {
  readonly listId: number
  readonly recipeId: number
}

/** « Ajouter » à la liste en cours de sélection, avec le nombre déjà mis. */
export const AddToList = ({ listId, recipeId }: Props) => {
  const lists = useListsApi()
  const { data, mutate } = useShoppingList(listId)
  const count = data?.recipes.find((r) => r.recipeId === recipeId)?.count ?? 0

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => mutate(() => lists.addRecipe(listId, recipeId))}
        className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
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
            className="rounded-lg border border-stone-300 px-2 py-1 text-sm text-stone-700 hover:bg-stone-100"
          >
            −
          </button>
        </>
      )}
    </div>
  )
}
