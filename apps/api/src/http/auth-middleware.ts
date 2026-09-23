import { Authentication, Unauthorized } from "@recettes/contract"
import { Effect, Layer, Option } from "effect"
import { Sessions } from "../domain/session.ts"
import { orInternalError } from "./errors.ts"

/**
 * Réalise le middleware déclaré dans le contrat : lit le cookie, interroge
 * Sessions, fournit CurrentUser. Ne couvre que les endpoints du contrat — la
 * route image fait le même appel à la main (image-route.ts).
 */
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const sessions = yield* Sessions

    return {
      cookie: (token) =>
        orInternalError(sessions.verify(token)).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new Unauthorized()),
              onSome: Effect.succeed,
            })
          )
        ),
    }
  })
)
