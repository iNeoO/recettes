import { Effect } from "effect"
import { loadCatalog } from "../src/ingredients/load.ts"

/**
 * Rapproche les noms que douze agents indépendants ont pu écrire différemment.
 *
 * Ne décide rien : produit une liste à arbitrer dans data/aliases.json. Une
 * règle automatique de pluriel confondrait « pâte » et « pâtes », qui sont deux
 * ingrédients distincts.
 */
const key = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .split(" ")
    .map((word) => word.replace(/[sx]$/, ""))
    .sort()
    .join(" ")

const program = Effect.gen(function* () {
  const catalog = yield* loadCatalog()

  const uses = new Map<string, number>()
  for (const entries of catalog.values()) {
    for (const entry of entries) uses.set(entry.name, (uses.get(entry.name) ?? 0) + 1)
  }

  const groups = new Map<string, Array<string>>()
  for (const name of uses.keys()) {
    const k = key(name)
    groups.set(k, [...(groups.get(k) ?? []), name])
  }

  const divergent = [...groups.values()].filter((names) => names.length > 1)
  console.log(`${uses.size} noms | ${divergent.length} groupes à arbitrer\n`)

  const suggestion: Record<string, string> = {}
  for (const names of divergent) {
    const sorted = [...names].sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0))
    const canonical = sorted[0]!
    console.log(names.map((n) => `${n} (${uses.get(n)})`).join("  |  "))
    for (const name of sorted.slice(1)) suggestion[name] = canonical
  }

  console.log("\n--- proposition (à relire avant de l'écrire dans data/aliases.json) ---")
  console.log(JSON.stringify(suggestion, null, 2))
})

Effect.runPromise(program).catch((error) => { console.error(error); process.exit(1) })
