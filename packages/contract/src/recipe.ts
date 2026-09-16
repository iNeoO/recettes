import { Schema } from "effect"

/** 1 ou 2 : il n'y a que deux livres, la valeur ne dépend pas du contenu. */
export const Book = Schema.Literal(1, 2)
export type Book = typeof Book.Type

export const Ingredient = Schema.Struct({
  /** Nom canonique, partagé par toutes les recettes qui l'emploient. */
  name: Schema.String,
  /** Pour 2 portions. "200g", "1/2", "2 cuillères à soupe", null si implicite. */
  quantity: Schema.NullOr(Schema.String),
  /** Sous-titre du bloc, ex. "Pour la vinaigrette". */
  section: Schema.NullOr(Schema.String),
  /** La ligne du PDF dont il est issu : la provenance reste vérifiable. */
  raw: Schema.String,
})
export type Ingredient = typeof Ingredient.Type

const base = {
  id: Schema.Number,
  book: Book,
  page: Schema.Number,
  title: Schema.String,
  category: Schema.NullOr(Schema.String),
  /** Toujours 2 : les quantités y sont ramenées. null pour pains et boissons. */
  servings: Schema.NullOr(Schema.Number),
  /** Chemin vers l'endpoint image, null si la page n'en porte aucune. */
  imageUrl: Schema.NullOr(Schema.String),
}

export const RecipeSummary = Schema.Struct(base)
export type RecipeSummary = typeof RecipeSummary.Type

export const Recipe = Schema.Struct({
  ...base,
  /** Étapes séparées par une ligne vide. */
  instructions: Schema.String,
  ingredients: Schema.Array(Ingredient),
})
export type Recipe = typeof Recipe.Type

/** Enveloppe de pagination : le total permet d'afficher « 137 résultats ». */
export const Page = <A, I, R>(item: Schema.Schema<A, I, R>) =>
  Schema.Struct({
    items: Schema.Array(item),
    total: Schema.Number,
    limit: Schema.Number,
    offset: Schema.Number,
  })

/** La page telle qu'elle circule : nommée pour être référencée des deux côtés. */
export const RecipeListPage = Page(RecipeSummary)
export type RecipeListPage = typeof RecipeListPage.Type

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100

export const ListQuery = Schema.Struct({
  /** Cherche dans le titre ET les ingrédients, sans tenir compte des accents. */
  search: Schema.optional(Schema.NonEmptyTrimmedString),
  category: Schema.optional(Schema.NonEmptyTrimmedString),
  book: Schema.optional(Schema.NumberFromString.pipe(Schema.compose(Book))),
  // Optionnels dans le contrat : le client n'a rien à passer. Les valeurs par
  // défaut sont une politique serveur, appliquées par normalize().
  limit: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, MAX_LIMIT))
  ),
  offset: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.nonNegative())
  ),
})
export type ListQuery = typeof ListQuery.Type
