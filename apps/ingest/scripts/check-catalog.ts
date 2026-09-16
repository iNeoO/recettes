import { Effect } from "effect"
import { readdir, readFile } from "node:fs/promises"
import { loadCatalog } from "../src/ingredients/load.ts"
import { normalizeLine } from "../src/ingredients/normalize.ts"

/** Vérifie que l'artefact couvre bien toutes les lignes envoyées aux agents. */
const program = Effect.gen(function* () {
  const catalog = yield* loadCatalog()

  const expected = new Set<string>()
  const files = yield* Effect.promise(() => readdir("data/slices"))
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const content = yield* Effect.promise(() => readFile(`data/slices/${file}`, "utf8"))
    for (const line of JSON.parse(content) as Array<string>) expected.add(normalizeLine(line))
  }

  const missing = [...expected].filter((line) => !catalog.has(line))
  const extra = [...catalog.keys()].filter((line) => !expected.has(line))
  const names = new Set([...catalog.values()].flat().map((i) => i.name))
  const empty = [...catalog.values()].filter((v) => v.length === 0).length

  console.log(`attendu   : ${expected.size} lignes`)
  console.log(`catalogue : ${catalog.size} lignes`)
  console.log(`manquantes: ${missing.length}`)
  console.log(`en trop   : ${extra.length}`)
  console.log(`sans substance : ${empty}`)
  console.log(`ingrédients canoniques distincts : ${names.size}`)
  for (const line of missing.slice(0, 20)) console.log(`  manque ${JSON.stringify(line)}`)
  for (const line of extra.slice(0, 10)) console.log(`  en trop ${JSON.stringify(line)}`)

  if (missing.length > 0) process.exitCode = 1
})

Effect.runPromise(program).catch((e) => { console.error(e); process.exit(1) })
