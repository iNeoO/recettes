import type { RecipeSummary } from "@recettes/contract"
import { Link } from "@tanstack/react-router"
import { imageSrc } from "../api.ts"

interface Props {
  readonly recipe: RecipeSummary
}

export const RecipeCard = ({ recipe }: Props) => (
  <article
    className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white
               transition hover:border-stone-400 hover:shadow-sm"
  >
    <Link
      to="/recipes/$id"
      params={{ id: String(recipe.id) }}
      // Les filtres suivent jusqu'au détail.
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
      <div className="p-2 sm:p-3">
        <h2 className="text-sm font-medium text-stone-900 sm:text-base">{recipe.title}</h2>
        <p className="mt-1 text-xs text-stone-500">
          {recipe.category ?? "sans catégorie"}
          {recipe.servings !== null && ` · ${recipe.servings} pers.`}
        </p>
      </div>
    </Link>
  </article>
)
