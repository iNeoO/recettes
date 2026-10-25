import { Context, Data, type Effect, type Option } from "effect"
import type { Recipe, RecipeSummary } from "@recettes/contract"
import type { RecipeQuery } from "./query.ts"

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown
}> {}

export interface RecipePage {
  readonly items: ReadonlyArray<RecipeSummary>
  readonly total: number
  readonly limit: number
  readonly offset: number
}

export interface StoredImage {
  readonly contentType: string
  readonly bytes: Uint8Array
  /** Empreinte de l'objet, pour l'en-tête ETag. */
  readonly etag: string | undefined
}

/**
 * Le port. Le domaine et la couche HTTP ne connaissent que cette interface ;
 * seul infra/ sait qu'il y a du SQL et un stockage objet derrière.
 */
export class RecipeRepository extends Context.Tag("RecipeRepository")<
  RecipeRepository,
  {
    readonly list: (query: RecipeQuery) => Effect.Effect<RecipePage, RepositoryError>
    readonly findById: (id: number) => Effect.Effect<Option.Option<Recipe>, RepositoryError>
    /** Les recettes demandées, dans l'ordre demandé ; les inconnues sont omises. */
    readonly summaries: (
      ids: ReadonlyArray<number>
    ) => Effect.Effect<ReadonlyArray<RecipeSummary>, RepositoryError>
    readonly imageKeyById: (id: number) => Effect.Effect<Option.Option<string>, RepositoryError>
  }
>() {}

/**
 * Le stockage objet, distinct du SQL : deux adaptateurs, deux raisons de
 * changer. Le domaine ignore que c'est du S3 derrière.
 */
export class ImageStore extends Context.Tag("ImageStore")<
  ImageStore,
  {
    readonly get: (key: string) => Effect.Effect<Option.Option<StoredImage>, RepositoryError>
  }
>() {}
