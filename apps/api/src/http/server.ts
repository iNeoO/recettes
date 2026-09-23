import { HttpApiBuilder, HttpApiScalar, HttpServer } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { DatabaseLive } from "@recettes/db"
import { Config, Layer } from "effect"
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

/** La route image est intercalée devant l'API : voir http/image-route.ts. */
export const ServerLive = HttpApiBuilder.serve(withImageRoute).pipe(
  Layer.provide(HttpApiScalar.layer({ path: "/docs" })),
  Layer.provide(ApiLive),
  Layer.provide(DomainLive)
)

if (import.meta.url === `file://${process.argv[1]}`) {
  NodeRuntime.runMain(
    Layer.launch(
      ServerLive.pipe(
        HttpServer.withLogAddress,
        Layer.provide(
          NodeHttpServer.layerConfig(createServer, {
            port: Config.integer("API_PORT").pipe(Config.withDefault(3000)),
          })
        )
      )
    )
  )
}
