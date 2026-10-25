import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect, Exit } from "effect"
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client"

const PREFIX = "recettes_api_"

/**
 * Les routes que l'API sert, et rien d'autre : `route` est un label Prometheus,
 * donc chaque valeur distincte est une série. Un chemin inconnu (scan, faute
 * de frappe) tombe dans `other` au lieu de faire exploser la cardinalité.
 * Une route ajoutée au contrat s'ajoute ici, sinon elle se compte en `other`.
 */
const KNOWN_ROUTES = new Set([
  "/auth/login",
  "/auth/logout",
  "/auth/me",
  "/recipes",
  "/recipes/:id",
  "/recipes/:id/image",
  "/lists",
  "/lists/:id",
  "/lists/:id/finalize",
  "/lists/:id/reopen",
  "/lists/:id/recipes",
  "/lists/:id/recipes/:id",
  "/lists/:id/recipes/:id/replace",
  "/lists/:id/checks/:id",
  "/metrics",
])

const NUMERIC_SEGMENT = /\/\d+(?=\/|$)/g

export const normalizeRoute = (url: string): string => {
  const path = (url.split("?")[0] ?? "/").replace(/\/+$/, "") || "/"
  if (path === "/docs" || path.startsWith("/docs/")) return "/docs"
  const template = path.replace(NUMERIC_SEGMENT, "/:id")
  return KNOWN_ROUTES.has(template) ? template : "other"
}

export const statusClass = (status: number): string => `${Math.floor(Math.max(status, 0) / 100)}xx`

const registry = new Registry()

// Boucle d'événements, GC, tas, descripteurs : ce qui dit si le processus va bien.
collectDefaultMetrics({ register: registry, prefix: PREFIX })

const httpRequestDuration = new Histogram({
  name: `${PREFIX}http_request_duration_seconds`,
  help: "Durée des requêtes HTTP en secondes, jusqu'à la réponse.",
  registers: [registry],
  labelNames: ["route", "method", "status_class"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
})

/**
 * Le login n'a aucune limitation (choix explicite, voir CLAUDE.md) : ce
 * compteur est ce qui permet au moins de voir un bourrinage dans Grafana.
 */
const logins = new Counter({
  name: `${PREFIX}logins_total`,
  help: "Tentatives de connexion, par résultat.",
  registers: [registry],
  labelNames: ["result"] as const,
})

export const observeLogin = (result: "success" | "failure"): void => {
  logins.labels(result).inc()
}

export const renderMetrics = (): Promise<string> => registry.metrics()
export const metricsContentType: string = registry.contentType

/**
 * Mesure chaque requête et en écrit une ligne de journal. Posé le plus à
 * l'extérieur possible : la route image et /metrics comptent aussi. Un défaut
 * non rattrapé devient un 500 côté serveur, on le compte comme tel.
 */
export const withMetrics = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const started = performance.now()
    const route = normalizeRoute(request.url)

    return yield* app.pipe(
      Effect.onExit((exit) => {
        const status = Exit.isSuccess(exit) ? exit.value.status : 500
        const durationMs = performance.now() - started
        httpRequestDuration
          .labels(route, request.method, statusClass(status))
          .observe(durationMs / 1000)
        // Le scrape lui-même ne s'écrit pas : une ligne toutes les 15 s pour rien.
        if (route === "/metrics") return Effect.void
        return Effect.logInfo("requête").pipe(
          Effect.annotateLogs({
            route,
            method: request.method,
            status,
            durationMs: Math.round(durationMs),
          })
        )
      })
    )
  })
)

const METRICS_PATH = /^\/metrics\/?$/

/**
 * Le point de scrape, hors contrat comme la route image : Prometheus le lit
 * par le réseau interne, et le reverse proxy doit refuser /api/metrics de
 * l'extérieur (voir deploy/nginx.conf). Sans authentification, exprès.
 */
export const withMetricsRoute =
  <E, R>(api: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      if (!METRICS_PATH.test(request.url.split("?")[0] ?? "")) return yield* api
      const body = yield* Effect.promise(renderMetrics)
      return HttpServerResponse.text(body, { contentType: metricsContentType })
    })
