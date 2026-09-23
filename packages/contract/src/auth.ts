import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from "@effect/platform"
import { Context, Schema } from "effect"

/** Nom du cookie de session. */
export const SESSION_COOKIE = "session"

/**
 * Le jeton voyage dans un cookie httpOnly plutôt qu'en Bearer : les photos
 * sont chargées par des <img>, qui ne peuvent pas porter d'en-tête.
 */
export const sessionSecurity = HttpApiSecurity.apiKey({ key: SESSION_COOKIE, in: "cookie" })

/** Ce que le serveur dit d'un compte. Jamais le mot de passe ni son hash. */
export const User = Schema.Struct({
  id: Schema.Number,
  email: Schema.String,
})
export type User = typeof User.Type

/** Cookie absent, jeton inconnu ou expiré, ou identifiants refusés au login. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  HttpApiSchema.annotations({ status: 401 })
) {}

/** L'utilisateur authentifié, fourni aux handlers par le middleware. */
export class CurrentUser extends Context.Tag("CurrentUser")<CurrentUser, User>() {}

/**
 * Le middleware d'authentification. Le contrat le déclare pour que l'OpenAPI
 * documente la sécurité et que les handlers reçoivent CurrentUser ; le serveur
 * en fournit l'implémentation.
 */
export class Authentication extends HttpApiMiddleware.Tag<Authentication>()("Authentication", {
  failure: Unauthorized,
  provides: CurrentUser,
  security: { cookie: sessionSecurity },
}) {}

export const Credentials = Schema.Struct({
  email: Schema.NonEmptyTrimmedString,
  password: Schema.Redacted(Schema.NonEmptyString),
})
export type Credentials = typeof Credentials.Type

export const AuthGroup = HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("login", "/auth/login")
      .setPayload(Credentials)
      .addSuccess(User)
      .addError(Unauthorized)
  )
  // Toujours 204 : révoquer une session déjà close n'est pas une erreur.
  .add(HttpApiEndpoint.post("logout", "/auth/logout").addSuccess(HttpApiSchema.NoContent))
  .add(HttpApiEndpoint.get("me", "/auth/me").addSuccess(User).middleware(Authentication))
