import { FetchHttpClient, HttpApiClient, HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { DatabaseLive } from "@recettes/db"
import { Effect, Layer } from "effect"
import { createServer } from "node:http"
import { RecettesApi } from "@recettes/contract"
import { ServerLive } from "../src/http/server.ts"

/**
 * Les tests parlent à un vrai serveur sur un port éphémère, via le client typé
 * engendré par le contrat : changer une réponse sans changer le test ne compile
 * plus. La base y est jointe, les tests semant leurs propres données.
 */
export const TestServer = Layer.mergeAll(
  ServerLive.pipe(
    // provideMerge : le test doit voir HttpServer pour lire le port attribué.
    Layer.provideMerge(NodeHttpServer.layer(createServer, { port: 0 }))
  ),
  DatabaseLive
)

const baseUrl = Effect.gen(function* () {
  const server = yield* HttpServer.HttpServer
  if (server.address._tag !== "TcpAddress") return yield* Effect.die("serveur sans adresse TCP")
  return `http://127.0.0.1:${server.address.port}`
})

export const client = baseUrl.pipe(
  Effect.flatMap((url) => HttpApiClient.make(RecettesApi, { baseUrl: url })),
  Effect.provide(FetchHttpClient.layer)
)

/** Requête brute, pour ce que le client typé ne peut pas exprimer. */
export const fetchPath = (path: string) =>
  baseUrl.pipe(Effect.flatMap((url) => Effect.promise(() => fetch(`${url}${path}`))))

/** L'endpoint image vit hors du contrat : on le lit directement. */
export const fetchImage = (id: number) => fetchPath(`/recipes/${id}/image`)
