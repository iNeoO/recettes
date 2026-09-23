import { defineConfig } from "drizzle-kit"

// drizzle-kit est un binaire : il ne passe pas par --env-file. En conteneur,
// l'URL arrive déjà par l'environnement et il n'y a pas de .env à lire.
if (process.env.DATABASE_URL === undefined) {
  process.loadEnvFile(new URL("../../.env", import.meta.url).pathname)
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
