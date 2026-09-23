import type { Ingredient } from "@recettes/contract"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { imageSrc, useApi } from "../api.ts"
import { useAuthGuard } from "../auth-guard.ts"
import { AddToList } from "../components/AddToList.tsx"
import { detailRoute } from "../routes.tsx"

/** Les sous-titres du bloc ingrédients, dans l'ordre où ils sont imprimés. */
const bySection = (ingredients: ReadonlyArray<Ingredient>) => {
  const groups: Array<{ section: string | null; items: Array<Ingredient> }> = []
  for (const ingredient of ingredients) {
    const last = groups.at(-1)
    if (last !== undefined && last.section === ingredient.section) last.items.push(ingredient)
    else groups.push({ section: ingredient.section, items: [ingredient] })
  }
  return groups
}

export const DetailPage = () => {
  const { id } = detailRoute.useParams()
  const { list } = detailRoute.useSearch()
  const api = useApi()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => api.byId(Number(id)),
  })
  useAuthGuard(error)

  if (isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Cette recette est introuvable.
      </p>
    )
  }
  if (isPending) return <p className="text-sm text-stone-500">Chargement…</p>

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-stone-900">{data.title}</h1>
        <p className="text-sm text-stone-500">
          {data.category ?? "sans catégorie"} · livre {data.book}, page {data.page}
          {data.servings !== null && ` · pour ${data.servings} personnes`}
        </p>
        {list !== undefined && <AddToList listId={list} recipeId={data.id} />}
      </header>

      {data.imageUrl !== null && (
        <img
          src={imageSrc(data.imageUrl)}
          alt={data.title}
          className="max-h-96 w-full rounded-xl object-cover"
        />
      )}

      <div className="grid gap-8 md:grid-cols-[20rem_1fr]">
        <section>
          <h2 className="mb-3 font-medium text-stone-900">Ingrédients</h2>
          {bySection(data.ingredients).map((group, index) => (
            <div key={index} className="mb-4">
              {group.section !== null && (
                <h3 className="mb-1 text-xs font-medium tracking-wide text-stone-500 uppercase">
                  {group.section}
                </h3>
              )}
              <ul className="space-y-1 text-sm">
                {group.items.map((ingredient, position) => (
                  <li key={position} className="flex gap-2">
                    {/* Assez large pour « 1 1/2 cuillère à soupe » sans repousser le nom. */}
                    <span className="w-36 shrink-0 text-stone-500">
                      {ingredient.quantity ?? ""}
                    </span>
                    {/* Cliquer cherche l'ingrédient : filtre textuel, pas un regroupement exact. */}
                    <Link
                      to="/"
                      search={{ search: ingredient.name }}
                      className="text-stone-800 underline-offset-2 hover:underline"
                    >
                      {ingredient.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-3 font-medium text-stone-900">Préparation</h2>
          <ol className="space-y-3 text-sm leading-relaxed text-stone-800">
            {data.instructions.split("\n\n").map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="shrink-0 text-stone-400">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  )
}
