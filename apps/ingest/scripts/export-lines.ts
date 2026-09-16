import { Effect } from "effect"
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { assemble } from "../src/assemble.ts"
import { normalizeLine } from "../src/ingredients/normalize.ts"
import { loadPages } from "../src/pdf.ts"

/**
 * Part des PDF et non de la base : l'ingestion a désormais besoin du catalogue,
 * qui a besoin de ces lignes — les lire en base créerait un cycle.
 */
const program = Effect.gen(function* () {
  const byKey = new Map<string, string>()
  let total = 0

  for (const book of [1, 2]) {
    const path = fileURLToPath(new URL(`../../../list${book}.pdf`, import.meta.url))
    const { recipes } = yield* loadPages(path, book).pipe(Effect.flatMap(assemble))
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        total++
        const key = normalizeLine(ingredient.raw)
        if (!byKey.has(key)) byKey.set(key, ingredient.raw)
      }
    }
  }

  const lines = [...byKey.values()].sort((a, b) => a.localeCompare(b, "fr"))
  yield* Effect.log(`${total} lignes → ${lines.length} distinctes`)

  const slices = Number(process.env.SLICES ?? 12)
  const size = Math.ceil(lines.length / slices)
  yield* Effect.promise(() => mkdir("data/slices", { recursive: true }))
  for (let i = 0; i < slices; i++) {
    const slice = lines.slice(i * size, (i + 1) * size)
    yield* Effect.promise(() =>
      writeFile(`data/slices/${String(i + 1).padStart(2, "0")}.json`, JSON.stringify(slice, null, 1))
    )
  }
  yield* Effect.log(`${slices} tranches de ~${size} lignes`)
})

Effect.runPromise(program).then(
  () => process.exit(0),
  (error) => { console.error(error); process.exit(1) }
)
