import { HttpApiBuilder } from "@effect/platform"
import { Effect } from "effect"
import { normalize } from "../domain/query.ts"
import { RecipeRepository, type RepositoryError } from "../domain/repository.ts"
import { RecettesApi, RecipeNotFound } from "@recettes/contract"

/**
 * Une panne d'infrastructure n'est pas une erreur du contrat : le client n'a
 * rien à en faire. On la journalise et elle devient un 500.
 */
const orInternalError = <A, R>(effect: Effect.Effect<A, RepositoryError, R>) =>
  effect.pipe(Effect.tapErrorCause(Effect.logError), Effect.orDie)

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
