import { Drawer } from "@base-ui/react/drawer"
import { DEFAULT_LIMIT, type RecipeSummary } from "@recettes/contract"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useApi, useListsApi } from "../api.ts"
import { CATEGORIES } from "../categories.ts"
import { MealCard } from "./MealCard.tsx"

const DEBOUNCE_MS = 300

interface PickerProps {
  readonly listId: number
  /** Les plats déjà dans la liste : visibles en recherche, pas choisissables. */
  readonly present: ReadonlySet<number>
  readonly onPick: (recipe: RecipeSummary) => void
}

interface Props extends PickerProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
}

/** Le contenu est démonté à la fermeture : chaque ouverture repart d'un tirage neuf, sans filtre. */
export const MealDrawer = ({ open, onOpenChange, title, ...picker }: Props) => (
  <Drawer.Root open={open} onOpenChange={onOpenChange}>
    <Drawer.Portal>
      <Drawer.Backdrop
        className="fixed inset-0 bg-stone-900/40 transition-opacity duration-300
                   data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <Drawer.Viewport className="fixed inset-0 flex items-end justify-center">
        <Drawer.Popup
          className="flex h-[85dvh] w-full max-w-2xl translate-y-(--drawer-swipe-movement-y) flex-col
                     rounded-t-2xl bg-white shadow-xl transition-transform duration-300
                     data-ending-style:translate-y-full data-starting-style:translate-y-full"
        >
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-stone-300" />
          <Drawer.Content className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 px-4 pt-2">
              <Drawer.Title className="truncate text-lg font-semibold text-stone-900">{title}</Drawer.Title>
              <Drawer.Close className="min-h-10 shrink-0 rounded-lg px-3 text-sm text-stone-600 hover:bg-stone-100">
                Fermer
              </Drawer.Close>
            </div>
            <MealPicker {...picker} />
          </Drawer.Content>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  </Drawer.Root>
)

const MealPicker = ({ listId, present, onPick }: PickerProps) => {
  const [text, setText] = useState("")
  const [search, setSearch] = useState<string | undefined>(undefined)
  const [category, setCategory] = useState<string | undefined>(undefined)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim() === "" ? undefined : text.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  const filtered = search !== undefined || category !== undefined

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-stone-200 px-4 py-3 sm:flex-row">
        <input
          type="search"
          aria-label="Chercher un plat"
          placeholder="Un plat, un ingrédient…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-10 flex-1 rounded-lg border border-stone-300 px-3 text-stone-900"
        />
        <select
          aria-label="Catégorie"
          value={category ?? ""}
          onChange={(event) => setCategory(event.target.value === "" ? undefined : event.target.value)}
          className="min-h-10 rounded-lg border border-stone-300 bg-white px-2 text-stone-900"
        >
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {filtered ? (
          <SearchResults search={search} category={category} present={present} onPick={onPick} />
        ) : (
          <Suggestions listId={listId} onPick={onPick} />
        )}
      </div>
    </>
  )
}

const Suggestions = ({ listId, onPick }: Omit<PickerProps, "present">) => {
  const lists = useListsApi()
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["suggestions", listId],
    queryFn: () => lists.suggestions(listId),
    // Un tirage par ouverture : ni cache entre deux ouvertures, ni nouveau tirage au focus.
    gcTime: 0,
    staleTime: Infinity,
  })

  return (
    <div className="space-y-2 pt-3">
      <button
        type="button"
        disabled={isFetching}
        onClick={() => void refetch()}
        className="min-h-10 w-full rounded-lg border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
      >
        Autres propositions
      </button>
      {isError ? (
        <p role="alert" className="text-sm text-red-700">
          Impossible de proposer des plats.
        </p>
      ) : isPending ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : data.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">Plus aucun plat à proposer.</p>
      ) : (
        <ul>
          {data.map((recipe) => (
            <MealOption key={recipe.id} recipe={recipe} present={false} onPick={onPick} />
          ))}
        </ul>
      )}
    </div>
  )
}

interface SearchProps extends Omit<PickerProps, "listId"> {
  readonly search: string | undefined
  readonly category: string | undefined
}

const SearchResults = ({ search, category, present, onPick }: SearchProps) => {
  const api = useApi()
  const { data, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["recipes", "picker", search, category],
    queryFn: ({ pageParam }) => api.list({ search, category, limit: DEFAULT_LIMIT, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length
      return next < last.total ? next : undefined
    },
  })

  if (isError) {
    return (
      <p role="alert" className="pt-3 text-sm text-red-700">
        Impossible de chercher.
      </p>
    )
  }
  if (isPending) return <p className="pt-3 text-sm text-stone-500">Chargement…</p>

  const total = data.pages[0]?.total ?? 0
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-stone-500">Aucun plat ne correspond.</p>
  }

  return (
    <div className="space-y-2 pt-3">
      <p className="text-sm text-stone-600">
        {total} résultat{total > 1 ? "s" : ""}
      </p>
      <ul>
        {data.pages.flatMap((page) =>
          page.items.map((recipe) => (
            <MealOption key={recipe.id} recipe={recipe} present={present.has(recipe.id)} onPick={onPick} />
          ))
        )}
      </ul>
      {hasNextPage && (
        <button
          type="button"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
          className="min-h-10 w-full rounded-lg border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
        >
          Voir plus
        </button>
      )}
    </div>
  )
}

interface OptionProps {
  readonly recipe: RecipeSummary
  readonly present: boolean
  readonly onPick: (recipe: RecipeSummary) => void
}

const MealOption = ({ recipe, present, onPick }: OptionProps) => (
  <li>
    <button
      type="button"
      disabled={present}
      onClick={() => onPick(recipe)}
      className="flex w-full items-center gap-3 rounded-lg py-2 text-left hover:bg-stone-50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <MealCard title={recipe.title} imageUrl={recipe.imageUrl} highlights={recipe.highlights} />
      {present && (
        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-600">
          Déjà dans la liste
        </span>
      )}
    </button>
  </li>
)
