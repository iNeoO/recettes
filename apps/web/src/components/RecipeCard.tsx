import type { RecipeSummary } from "@recettes/contract"
import { Link } from "@tanstack/react-router"
import { imageSrc } from "../api.ts"

export const RecipeCard = ({ recipe }: { readonly recipe: RecipeSummary }) => (
  <Link
    to="/recipes/$id"
    params={{ id: String(recipe.id) }}
    className="group block overflow-hidden rounded-xl border border-stone-200 bg-white
               transition hover:border-stone-400 hover:shadow-sm"
  >
    <article>
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
          {recipe.servings !== null && ` · ${recipe.servings} portions`}
        </p>
      </div>
    </article>
  </Link>
)
