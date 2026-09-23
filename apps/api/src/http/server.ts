import { HttpApiBuilder, HttpApiScalar, HttpServer } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { DatabaseLive } from "@recettes/db"
import { Config, Layer, Logger } from "effect"
import { createServer } from "node:http"
import { SessionsLive } from "../domain/session.ts"
import { UsersLive } from "../domain/users.ts"
import { PasswordHasherLive } from "../infra/argon2.ts"
import { ImageStoreLive } from "../infra/image-store-garage.ts"
import { RecipeRepositoryLive } from "../infra/repository-drizzle.ts"
import { SessionStoreLive } from "../infra/sessions-drizzle.ts"
import { ShoppingListRepositoryLive } from "../infra/shopping-lists-drizzle.ts"
import { UserRepositoryLive } from "../infra/users-drizzle.ts"
import { RecettesApi } from "@recettes/contract"
import { AuthLive } from "./auth-handlers.ts"
import { AuthenticationLive } from "./auth-middleware.ts"
import { RecipesLive } from "./handlers.ts"
import { ListsLive } from "./list-handlers.ts"
import { withImageRoute } from "./image-route.ts"
import { withMetrics, withMetricsRoute } from "./metrics.ts"

/** Les adaptateurs qui réalisent les ports du domaine. */
export const InfraLive = Layer.mergeAll(
  RecipeRepositoryLive,
  ImageStoreLive,
  UserRepositoryLive,
  SessionStoreLive,
  PasswordHasherLive,
  ShoppingListRepositoryLive
).pipe(Layer.provideMerge(DatabaseLive))

/** Les services du domaine, posés sur les adaptateurs. */
export const DomainLive = Layer.mergeAll(UsersLive, SessionsLive).pipe(
  Layer.provideMerge(InfraLive)
)

export const ApiLive = HttpApiBuilder.api(RecettesApi).pipe(
  Layer.provide(RecipesLive),
  Layer.provide(AuthLive),
  Layer.provide(ListsLive),
  Layer.provide(AuthenticationLive),
  Layer.provide(DomainLive)
)

/**
 * Devant l'API déclarative : la route image et le point de scrape (hors
 * contrat), puis la mesure de chaque requête, la plus à l'extérieur.
 */
export const ServerLive = HttpApiBuilder.serve((app) =>
  withMetrics(withMetricsRoute(withImageRoute(app)))
).pipe(
  Layer.provide(HttpApiScalar.layer({ path: "/docs" })),
  Layer.provide(ApiLive),
  Layer.provide(DomainLive)
)

/**
 * LOG_FORMAT=json en production : une ligne JSON par entrée, que Loki sait
 * lire. Décidé au niveau du processus, avant runMain : c'est lui qui installe
 * le logger lisible, et il faut le lui interdire plutôt que d'en ajouter un.
 */
const LOG_FORMATS = ["pretty", "json"] as const
type LogFormat = (typeof LOG_FORMATS)[number]
const isLogFormat = (value: string | undefined): value is LogFormat =>
  LOG_FORMATS.some((format) => format === value)

const logFormat = (): LogFormat => {
  const value = process.env["LOG_FORMAT"]
  if (value === undefined) return "pretty"
  if (isLogFormat(value)) return value
  throw new Error(`LOG_FORMAT : « ${value} » inconnu, attendu pretty ou json`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const format = logFormat()
  NodeRuntime.runMain(
    Layer.launch(
      ServerLive.pipe(
        HttpServer.withLogAddress,
        Layer.provide(
          NodeHttpServer.layerConfig(createServer, {
            port: Config.integer("API_PORT").pipe(Config.withDefault(3000)),
          })
        ),
        Layer.provide(format === "json" ? Logger.json : Layer.empty)
      )
    ),
    { disablePrettyLogger: format === "json" }
  )
}
