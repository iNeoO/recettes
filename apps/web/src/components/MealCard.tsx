import { imageSrc } from "../api.ts"

interface Props {
  readonly title: string
  readonly imageUrl: string | null
  readonly highlights: ReadonlyArray<string>
}

/** Photo, titre et ingrédients phares : de quoi choisir un plat sans ouvrir sa fiche. */
export const MealCard = ({ title, imageUrl, highlights }: Props) => (
  <div className="flex min-w-0 flex-1 items-center gap-3">
    <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-stone-100">
      {imageUrl !== null && (
        <img src={imageSrc(imageUrl)} alt="" loading="lazy" className="size-full object-cover" />
      )}
    </div>
    <div className="min-w-0">
      <p className="truncate font-medium text-stone-900">{title}</p>
      {highlights.length > 0 && (
        <p className="truncate text-sm text-stone-500">{highlights.join(", ")}</p>
      )}
    </div>
  </div>
)
