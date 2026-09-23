import { Algorithm, hash, verify } from "@node-rs/argon2"
import { Effect, Layer, Redacted } from "effect"
import { PasswordHasher } from "../domain/users.ts"

/** Paramètres OWASP pour argon2id : 19 Mio, 2 passes, 1 fil. */
const OPTIONS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }

export const PasswordHasherLive = Layer.succeed(PasswordHasher, {
  hash: (password) => Effect.promise(() => hash(Redacted.value(password), OPTIONS)),
  // Un hash illisible vaut un refus, pas une panne : verify rejette, on rend false.
  verify: (stored, password) =>
    Effect.promise(() => verify(stored, Redacted.value(password)).catch(() => false)),
})
