import { Effect } from "effect"
import type { RepositoryError } from "../domain/repository.ts"

/**
 * Une panne d'infrastructure n'est pas une erreur du contrat : le client n'a
 * rien à en faire. On la journalise et elle devient un 500.
 */
export const orInternalError = <A, E, R>(effect: Effect.Effect<A, E | RepositoryError, R>) =>
  effect.pipe(
    Effect.catchTag("RepositoryError", (error) =>
      Effect.logError(error).pipe(Effect.andThen(Effect.die(error)))
    )
  )
