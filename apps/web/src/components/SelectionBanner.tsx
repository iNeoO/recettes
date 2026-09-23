import { Link } from "@tanstack/react-router"
import { ListMissing } from "../api.ts"
import { useShoppingList } from "../lists.ts"

/**
 * Tant que ?list= est dans l'URL, on parcourt les recettes pour cette liste.
 * Collant : au téléphone, « Terminer » doit rester sous le pouce en défilant.
 */
export const SelectionBanner = ({ listId }: { readonly listId: number }) => {
  const { data, error } = useShoppingList(listId)
  const count = data?.recipes.reduce((n, r) => n + r.count, 0) ?? 0
  const missing = error instanceof ListMissing

  return (
    <div role="status" className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
        {missing ? (
          <>
            <span className="text-amber-900">Cette liste n'existe plus.</span>
            <Link
              to="/lists"
              className="inline-flex min-h-10 items-center rounded-lg bg-amber-900 px-3 font-medium text-white hover:bg-amber-800"
            >
              Voir les listes
            </Link>
          </>
        ) : (
          <>
            <span className="text-amber-900">
              Sélection pour <strong>{data?.name ?? "la liste"}</strong> · {count} plat
              {count > 1 ? "s" : ""}
            </span>
            <Link
              to="/lists/$id"
              params={{ id: String(listId) }}
              className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-amber-900 px-3 font-medium text-white hover:bg-amber-800"
            >
              Terminer
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
