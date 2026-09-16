import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect, Option } from "effect"
import { ImageStore, RecipeRepository } from "../domain/repository.ts"

const PATH = /^\/recipes\/(\d+)\/image\/?$/

/** Reconnaît la route sans consulter le routeur, pour maîtriser l'ordre. */
export const matchImagePath = (url: string): number | null => {
  const path = url.split("?")[0] ?? ""
  const match = PATH.exec(path)
  return match === null ? null : Number(match[1])
}

/**
 * Servi hors du contrat HttpApi, qui impose un Content-Type statique : les
 * photos sont tantôt JPEG tantôt PNG, et le type réel doit sortir en en-tête.
 *
 * Totale par construction : montée devant l'API, une erreur non traitée
 * ferait tomber toute l'application.
 */
export const serveImage = (id: number) =>
  Effect.gen(function* () {
    const repository = yield* RecipeRepository
    const store = yield* ImageStore

    const image = yield* repository.imageKeyById(id).pipe(
      Effect.flatMap(Option.match({ onNone: () => Effect.succeedNone, onSome: store.get }))
    )

    return Option.match(image, {
      onNone: () => HttpServerResponse.empty({ status: 404 }),
      onSome: (found) =>
        HttpServerResponse.uint8Array(found.bytes, {
          contentType: found.contentType,
          headers: found.etag === undefined ? undefined : { etag: found.etag },
        }),
    })
  }).pipe(
    Effect.catchTag("RepositoryError", (error) =>
      Effect.logError("lecture de l'image impossible", error).pipe(
        Effect.as(HttpServerResponse.empty({ status: 500 }))
      )
    )
  )

/** Intercale la route image devant l'application déclarative. */
export const withImageRoute =
  <E, R>(api: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const id = matchImagePath(request.url)
      return id === null ? yield* api : yield* serveImage(id)
    })
