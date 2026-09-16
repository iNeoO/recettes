interface Props {
  readonly total: number
  readonly limit: number
  readonly offset: number
  readonly onOffset: (offset: number) => void
}

export const Pagination = ({ total, limit, offset, onOffset }: Props) => {
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  const button =
    "rounded-lg border border-stone-300 px-3 py-1.5 text-sm enabled:hover:border-stone-500 " +
    "disabled:opacity-40"

  return (
    <nav className="flex items-center justify-center gap-4" aria-label="Pagination">
      <button
        type="button"
        className={button}
        disabled={offset === 0}
        onClick={() => onOffset(Math.max(0, offset - limit))}
      >
        Précédent
      </button>
      <span className="text-sm text-stone-600">
        Page {page} sur {pages}
      </span>
      <button
        type="button"
        className={button}
        disabled={offset + limit >= total}
        onClick={() => onOffset(offset + limit)}
      >
        Suivant
      </button>
    </nav>
  )
}
