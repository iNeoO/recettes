import type { RecipeSummary } from "@recettes/contract"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { imageSrc } from "../api.ts"

interface Props {
  readonly recipe: RecipeSummary
  /** Un bouton d'action sous la carte, hors du lien : « Ajouter » en mode sélection. */
  readonly footer?: ReactNode
}

export const RecipeCard = ({ recipe, footer }: Props) => (
  <article
    className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white
               transition hover:border-stone-400 hover:shadow-sm"
  >
    <Link
      to="/recipes/$id"
      params={{ id: String(recipe.id) }}
      // Les filtres et la liste en cours de sélection suivent jusqu'au détail.
      search={(previous) => previous}
      className="block"
    >
      <div className="aspect-4/3 overflow-hidden bg-stone-100">
        {recipe.imageUrl === null ? (
          <div className="flex h-full items-center justify-center text-sm text-stone-400">
            sans photo
          </div>
        ) : (
          <img
            src={imageSrc(recipe.imageUrl)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        )}
      </div>
      <div className="p-3">
        <h2 className="font-medium text-stone-900">{recipe.title}</h2>
        <p className="mt-1 text-xs text-stone-500">
          {recipe.category ?? "sans catégorie"}
          {recipe.servings !== null && ` · ${recipe.servings} pers.`}
        </p>
      </div>
    </Link>
    {footer !== undefined && <div className="mt-auto px-3 pb-3">{footer}</div>}
  </article>
)
