import { defineConfig } from "drizzle-kit"

// drizzle-kit est un binaire : il ne passe pas par --env-file.
process.loadEnvFile(new URL("../../.env", import.meta.url).pathname)

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
