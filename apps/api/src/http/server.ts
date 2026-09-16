import { HttpApiBuilder, HttpApiScalar, HttpServer } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { DatabaseLive } from "@recettes/db"
import { Config, Layer } from "effect"
import { createServer } from "node:http"
import { ImageStoreLive } from "../infra/image-store-garage.ts"
import { RecipeRepositoryLive } from "../infra/repository-drizzle.ts"
import { RecettesApi } from "@recettes/contract"
import { RecipesLive } from "./handlers.ts"
import { withImageRoute } from "./image-route.ts"

/** Les adaptateurs qui réalisent les ports du domaine. */
export const InfraLive = Layer.mergeAll(RecipeRepositoryLive, ImageStoreLive).pipe(
  Layer.provideMerge(DatabaseLive)
)

export const ApiLive = HttpApiBuilder.api(RecettesApi).pipe(
  Layer.provide(RecipesLive),
  Layer.provide(InfraLive)
)

/** La route image est intercalée devant l'API : voir http/image-route.ts. */
export const ServerLive = HttpApiBuilder.serve(withImageRoute).pipe(
  Layer.provide(HttpApiScalar.layer({ path: "/docs" })),
  Layer.provide(ApiLive),
  Layer.provide(InfraLive)
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
