import { Data } from "effect"

/** Un fragment de texte tel que pdfjs le rend, avec sa position et sa taille. */
export interface TextItem {
  readonly str: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly size: number
}

export interface PageInput {
  readonly book: number
  readonly page: number
  readonly items: ReadonlyArray<TextItem>
}

export interface Ingredient {
  readonly raw: string
  /** Sous-titre désindenté du bloc ingrédients, ex. "Pour la vinaigrette". */
  readonly section: string | null
}

export type ParsedPage =
  | { readonly kind: "divider"; readonly category: string }
  | {
      readonly kind: "recipe"
      readonly title: string
      readonly servings: number | null
      readonly ingredients: ReadonlyArray<Ingredient>
      readonly instructions: string
    }
  | {
      readonly kind: "continuation"
      readonly title: string | null
      readonly instructions: string
    }

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly book: number
  readonly page: number
  readonly reason: string
}> {
  get message() {
    return `livre ${this.book} p${this.page}: ${this.reason}`
  }
}
