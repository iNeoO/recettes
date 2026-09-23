import { type Book, type ListQuery, MAX_LIMIT } from "@recettes/contract"
import { Option, Schema } from "effect"

/** Le routeur rend tantôt des chaînes, tantôt des nombres selon ce qu'il a parsé. */
const NumberLike = Schema.Union(Schema.Number, Schema.NumberFromString)

const Text = Schema.NonEmptyTrimmedString
const BookParam = NumberLike.pipe(Schema.compose(Schema.Literal(1, 2)))
const Limit = NumberLike.pipe(Schema.int(), Schema.between(1, MAX_LIMIT))
const Offset = NumberLike.pipe(Schema.int(), Schema.nonNegative())
const Id = NumberLike.pipe(Schema.int(), Schema.positive())

/**
 * Un chemin de cette application, et rien d'autre : sans cela, ?redirect=
 * renverrait n'importe où après connexion. « // » et « /\ » sont exclus, les
 * navigateurs les lisent comme un changement d'hôte.
 */
const InternalPath = Schema.String.pipe(Schema.pattern(/^\/(?![/\\])/))

/** Un champ absent ou invalide vaut undefined ; les autres sont préservés. */
const field =
  <A, I>(schema: Schema.Schema<A, I, never>) =>
  (value: unknown): A | undefined =>
    value === undefined
      ? undefined
      : Option.getOrUndefined(Schema.decodeUnknownOption(schema)(value))

/**
 * Les filtres de la liste, la destination à retrouver après connexion, et la
 * liste de courses en cours de sélection : tant que `list` est là, chaque
 * recette propose « Ajouter ».
 */
export interface AppSearch extends ListQuery {
  readonly redirect?: string
  readonly list?: number
}

/**
 * Les filtres vivent dans l'URL et sont parsés ici, une fois, avant tout usage.
 *
 * Toutes les clés sont rendues, `undefined` comprises : le routeur fusionne le
 * résultat dans les paramètres bruts par Object.assign, donc omettre une clé la
 * laisserait passer telle quelle. Et chaque champ est validé indépendamment —
 * un ?limit=99999 ne doit pas faire perdre un ?search=creme valide.
 */
export const validateSearch = (input: Record<string, unknown>): AppSearch => ({
  search: field(Text)(input["search"]),
  category: field(Text)(input["category"]),
  book: field(BookParam)(input["book"]),
  limit: field(Limit)(input["limit"]),
  offset: field(Offset)(input["offset"]),
  redirect: field(InternalPath)(input["redirect"]),
  list: field(Id)(input["list"]),
})

export type { Book }
