import {
  FetchHttpClient,
  HttpApiClient,
  HttpClient,
  HttpClientRequest,
  HttpServer,
} from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { RecettesApi, SESSION_COOKIE } from "@recettes/contract"
import { Effect, Layer, Redacted } from "effect"
import { createServer } from "node:http"
import { Users } from "../src/domain/users.ts"
import { DomainLive, ServerLive } from "../src/http/server.ts"
import { ShiftedClock } from "./clock.ts"

/**
 * Les tests parlent à un vrai serveur sur un port éphémère, via le client typé
 * engendré par le contrat : changer une réponse sans changer le test ne compile
 * plus. Le domaine y est joint pour semer comptes et données.
 */
export const TestServer = Layer.mergeAll(
  ServerLive.pipe(
    // provideMerge : le test doit voir HttpServer pour lire le port attribué.
    Layer.provideMerge(NodeHttpServer.layer(createServer, { port: 0 })),
    Layer.provide(ShiftedClock)
  ),
  DomainLive
)

const baseUrl = Effect.gen(function* () {
  const server = yield* HttpServer.HttpServer
  if (server.address._tag !== "TcpAddress") return yield* Effect.die("serveur sans adresse TCP")
  return `http://127.0.0.1:${server.address.port}`
})

const withCookie = (token: string) =>
  HttpClient.mapRequest(HttpClientRequest.setHeader("cookie", `${SESSION_COOKIE}=${token}`))

/** Le client typé, porteur du cookie donné ; sans jeton, il est anonyme. */
export const clientWithToken = (token = "") =>
  baseUrl.pipe(
    Effect.flatMap((url) =>
      HttpApiClient.make(RecettesApi, {
        baseUrl: url,
        transformClient: token === "" ? undefined : withCookie(token),
      })
    ),
    Effect.provide(FetchHttpClient.layer)
  )

export const anonymous = clientWithToken()

export const ACCOUNT = { email: "anne@example.org", password: "correct horse battery" }

/** Crée le compte de test s'il n'existe pas encore. */
export const seedAccount = (account = ACCOUNT) =>
  Effect.gen(function* () {
    const users = yield* Users
    yield* users
      .create(account.email, Redacted.make(account.password))
      .pipe(Effect.catchTag("EmailAlreadyUsed", () => Effect.void))
  })

/** Requête brute, pour ce que le client typé ne peut pas exprimer. */
export const fetchPath = (path: string, init?: RequestInit) =>
  baseUrl.pipe(Effect.flatMap((url) => Effect.promise(() => fetch(`${url}${path}`, init))))

/** La réponse brute du login : le client typé ne rend pas les en-têtes. */
export const loginRaw = (email: string, password: string) =>
  fetchPath("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

/** Le jeton porté par un Set-Cookie, ou "" s'il n'y en a pas. */
export const tokenOf = (response: Response): string => {
  const header = response.headers.get("set-cookie") ?? ""
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`).exec(header)
  return match?.[1] ?? ""
}

/** Ouvre une session pour le compte de test et rend le jeton. */
export const login = (account = ACCOUNT) =>
  loginRaw(account.email, account.password).pipe(
    Effect.map((response) => {
      if (response.status !== 200) throw new Error(`login : ${response.status}`)
      return tokenOf(response)
    })
  )

/** Un jeton de session valide pour le compte de test, semé au passage. */
export const sessionToken = seedAccount().pipe(Effect.andThen(login()))

/** Le client typé d'un utilisateur connecté. */
export const authenticated = sessionToken.pipe(Effect.flatMap(clientWithToken))

/** Le client typé d'un autre compte, pour tout ce qui doit être cloisonné. */
export const authenticatedAs = (account: { email: string; password: string }) =>
  seedAccount(account).pipe(Effect.andThen(login(account)), Effect.flatMap(clientWithToken))

export const cookieHeader = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` })

/** L'endpoint image vit hors du contrat : on le lit directement. */
export const fetchImage = (id: number, token = "") =>
  fetchPath(`/recipes/${id}/image`, token === "" ? undefined : { headers: cookieHeader(token) })
