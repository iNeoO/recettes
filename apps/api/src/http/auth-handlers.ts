import { HttpApiBuilder } from "@effect/platform"
import { CurrentUser, RecettesApi, sessionSecurity, Unauthorized } from "@recettes/contract"
import { Duration, Effect, Option, Redacted } from "effect"
import { SESSION_TTL, Sessions } from "../domain/session.ts"
import { Users } from "../domain/users.ts"
import { orInternalError } from "./errors.ts"
import { observeLogin } from "./metrics.ts"

/**
 * Path=/ est indispensable : le front appelle /api/auth/login, et sans lui le
 * navigateur limiterait le cookie à /api/auth — les recettes resteraient en 401.
 * Secure passe en clair sur localhost, que les navigateurs traitent comme sûr.
 */
const COOKIE = { path: "/", httpOnly: true, secure: true, sameSite: "lax" } as const

export const AuthLive = HttpApiBuilder.group(RecettesApi, "auth", (handlers) =>
  Effect.gen(function* () {
    const users = yield* Users
    const sessions = yield* Sessions

    return handlers
      .handle("login", ({ payload }) =>
        Effect.gen(function* () {
          const found = yield* orInternalError(users.authenticate(payload.email, payload.password))
          // Même réponse pour un mot de passe faux et une adresse inconnue.
          if (Option.isNone(found)) {
            observeLogin("failure")
            return yield* new Unauthorized()
          }
          observeLogin("success")
          const token = yield* orInternalError(sessions.open(found.value.id))
          yield* HttpApiBuilder.securitySetCookie(sessionSecurity, token, {
            ...COOKIE,
            maxAge: SESSION_TTL,
          })
          return found.value
        })
      )
      .handle("logout", () =>
        Effect.gen(function* () {
          const token = yield* HttpApiBuilder.securityDecode(sessionSecurity)
          if (Redacted.value(token) !== "") yield* orInternalError(sessions.revoke(token))
          // Max-Age=0 : le navigateur oublie le cookie, même s'il était déjà invalide.
          yield* HttpApiBuilder.securitySetCookie(sessionSecurity, "", {
            ...COOKIE,
            maxAge: Duration.zero,
          })
        })
      )
      .handle("me", () => CurrentUser)
  })
)
