import { Link } from "@tanstack/react-router"
import { useShoppingList } from "../lists.ts"

/** Tant que ?list= est dans l'URL, on parcourt les recettes pour cette liste. */
export const SelectionBanner = ({ listId }: { readonly listId: number }) => {
  const { data } = useShoppingList(listId)
  const count = data?.recipes.reduce((n, r) => n + r.count, 0) ?? 0

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-sm">
        <span className="text-amber-900">
          Sélection pour <strong>{data?.name ?? "la liste"}</strong> · {count} plat
          {count > 1 ? "s" : ""}
        </span>
        <Link
          to="/lists/$id"
          params={{ id: String(listId) }}
          className="rounded-lg bg-amber-900 px-3 py-1 font-medium text-white hover:bg-amber-800"
        >
          Terminer
        </Link>
      </div>
    </div>
  )
}
