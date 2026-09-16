import type { ListQuery } from "@recettes/contract"
import { useEffect, useState } from "react"
import { CATEGORIES } from "../categories.ts"

interface Props {
  readonly value: ListQuery
  readonly onChange: (next: ListQuery) => void
}

/** Sans ce délai, taper « creme » émettrait cinq requêtes. */
const DEBOUNCE_MS = 300

export const Filters = ({ value, onChange }: Props) => {
  const [text, setText] = useState(value.search ?? "")

  // L'URL fait foi : un retour arrière doit remettre le champ à sa valeur.
  useEffect(() => setText(value.search ?? ""), [value.search])

  useEffect(() => {
    const current = value.search ?? ""
    if (text === current) return
    const timer = setTimeout(
      () => onChange({ ...value, search: text === "" ? undefined : text, offset: 0 }),
      DEBOUNCE_MS
    )
    return () => clearTimeout(timer)
  }, [text])

  const categories = CATEGORIES.filter((c) => value.book === undefined || c.book === value.book)

  return (
    <div className="flex flex-wrap gap-3">
      <input
        type="search"
        aria-label="Rechercher"
        placeholder="Rechercher un plat ou un ingrédient…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-w-64 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm
                   outline-none focus:border-stone-500"
      />

      <select
        aria-label="Livre"
        value={value.book ?? ""}
        onChange={(event) =>
          onChange({
            ...value,
            book: event.target.value === "" ? undefined : (Number(event.target.value) as 1 | 2),
            // La catégorie appartient à un livre : la garder serait vide de sens.
            category: undefined,
            offset: 0,
          })
        }
        className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
      >
        <option value="">Les deux livres</option>
        <option value="1">Livre 1</option>
        <option value="2">Livre 2</option>
      </select>

      <select
        aria-label="Catégorie"
        value={value.category ?? ""}
        onChange={(event) =>
          onChange({
            ...value,
            category: event.target.value === "" ? undefined : event.target.value,
            offset: 0,
          })
        }
        className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
      >
        <option value="">Toutes les catégories</option>
        {categories.map((category) => (
          <option key={category.name} value={category.name}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  )
}
