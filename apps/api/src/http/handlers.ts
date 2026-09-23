import { HttpApiBuilder } from "@effect/platform"
import { Effect } from "effect"
import { normalize } from "../domain/query.ts"
import { RecipeRepository } from "../domain/repository.ts"
import { RecettesApi, RecipeNotFound } from "@recettes/contract"
import { orInternalError } from "./errors.ts"

export const RecipesLive = HttpApiBuilder.group(RecettesApi, "recipes", (handlers) =>
  Effect.gen(function* () {
    const repository = yield* RecipeRepository

    return handlers
      .handle("list", ({ urlParams }) =>
        orInternalError(repository.list(normalize(urlParams)))
      )
      .handle("byId", ({ path }) =>
        orInternalError(repository.findById(path.id)).pipe(
          Effect.flatMap(Effect.orElseFail(() => new RecipeNotFound({ id: path.id })))
        )
      )
  })
)
