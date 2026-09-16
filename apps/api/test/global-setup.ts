import { readdir, readFile } from "node:fs/promises"
import { Client } from "pg"

/**
 * Recrée la base de test à neuf puis applique les migrations dans l'ordre.
 *
 * Recréer plutôt que rejouer : une migration qui supprime et recrée une table
 * rend le rejeu incohérent, et avaler les erreurs « existe déjà » masquerait
 * de vraies pannes. La base de développement et ses 887 recettes sont ailleurs.
 */
export default async function setup() {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname)

  const url = new URL(process.env.TEST_DATABASE_URL!)
  const database = url.pathname.slice(1)

  const admin = new Client({ connectionString: new URL("/postgres", url).toString() })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${database}"`)
  await admin.end()

  const client = new Client({ connectionString: url.toString() })
  await client.connect()
  const directory = new URL("../../../packages/db/migrations/", import.meta.url)
  for (const file of (await readdir(directory)).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(file, directory), "utf8")
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.query(statement)
    }
  }
  await client.end()

  // Les couches Effect lisent DATABASE_URL : on les pointe sur la base de test.
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
}
