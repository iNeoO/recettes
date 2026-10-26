import type { ListRecipe, RecipeSummary } from "@recettes/contract"
import { Link, Navigate, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { ListMissing, useListsApi } from "../api.ts"
import { useAuthGuard } from "../auth-guard.ts"
import { MealCard } from "../components/MealCard.tsx"
import { MealDrawer } from "../components/MealDrawer.tsx"
import { useShoppingList } from "../lists.ts"
import { preparationRoute } from "../routes.tsx"

type Choice = { readonly kind: "add" } | { readonly kind: "replace"; readonly recipe: ListRecipe }

export const PreparationPage = () => {
  const { id } = preparationRoute.useParams()
  const listId = Number(id)
  const lists = useListsApi()
  const navigate = useNavigate()
  const { data, isPending, isError, error, mutate, pending } = useShoppingList(listId)
  useAuthGuard(error)
  const [open, setOpen] = useState(false)
  // Gardé après la fermeture : le titre ne doit pas changer pendant l'animation de sortie.
  const [choice, setChoice] = useState<Choice>({ kind: "add" })

  if (isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {error instanceof ListMissing ? "Cette liste est introuvable." : "Impossible de charger la liste."}
      </p>
    )
  }
  if (isPending) return <p className="text-sm text-stone-500">Chargement…</p>
  if (data.status === "ready") return <Navigate to="/lists/$id" params={{ id }} replace />

  const choose = (next: Choice) => {
    setChoice(next)
    setOpen(true)
  }

  const pick = (recipe: RecipeSummary) => {
    setOpen(false)
    mutate(() =>
      choice.kind === "add"
        ? lists.addRecipe(listId, recipe.id)
        : lists.replaceRecipe(listId, choice.recipe.recipeId, recipe.id)
    )
  }

  const finalize = () =>
    mutate(() => lists.finalize(listId), {
      onSuccess: () => void navigate({ to: "/lists/$id", params: { id } }),
    })

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-sm text-stone-500">
          <Link to="/lists" className="hover:underline">
            Listes de courses
          </Link>
        </p>
        <h1 className="text-2xl font-semibold text-stone-900">{data.name}</h1>
        <p className="text-sm text-stone-600">Choisir les plats</p>
      </header>

      {data.recipes.length === 0 ? (
        <p className="text-sm text-stone-500">Aucun plat pour l'instant.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {data.recipes.map((recipe) => (
            <li key={recipe.recipeId} className="flex flex-wrap items-center gap-3 px-3 py-2 sm:flex-nowrap">
              <Link
                to="/recipes/$id"
                params={{ id: String(recipe.recipeId) }}
                // Seul sur sa ligne au téléphone : les boutons passent dessous plutôt que de tronquer le titre.
                className="flex min-w-0 basis-full hover:opacity-80 sm:basis-auto sm:flex-1"
              >
                <MealCard title={recipe.title} imageUrl={recipe.imageUrl} highlights={recipe.highlights} />
              </Link>
              <div className="ml-auto flex shrink-0 gap-2">
                <button
                  type="button"
                  aria-label={`Remplacer ${recipe.title}`}
                  disabled={pending}
                  onClick={() => choose({ kind: "replace", recipe })}
                  className="min-h-10 rounded-lg border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                >
                  Remplacer
                </button>
                <button
                  type="button"
                  aria-label={`Retirer ${recipe.title}`}
                  disabled={pending}
                  onClick={() => mutate(() => lists.removeRecipe(listId, recipe.recipeId))}
                  className="min-h-10 rounded-lg border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                >
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => choose({ kind: "add" })}
        className="min-h-10 w-full rounded-lg border border-dashed border-stone-400 px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
      >
        Ajouter un plat
      </button>

      {/* Collé en bas : avec des photos, la liste dépasse vite la hauteur d'un téléphone. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <span className="text-sm text-stone-600">
            {data.recipes.length} plat{data.recipes.length > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            disabled={pending || data.recipes.length === 0}
            onClick={finalize}
            className="min-h-11 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            Valider les plats
          </button>
        </div>
      </div>

      <MealDrawer
        open={open}
        onOpenChange={setOpen}
        title={choice.kind === "add" ? "Ajouter un plat" : `Remplacer ${choice.recipe.title}`}
        listId={listId}
        present={new Set(data.recipes.map((recipe) => recipe.recipeId))}
        onPick={pick}
      />
    </div>
  )
}
