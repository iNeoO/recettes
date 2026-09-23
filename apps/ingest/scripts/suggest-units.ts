import { Effect } from "effect"
import { loadAliases, loadCatalog, loadUnits } from "../src/ingredients/load.ts"
import { canonical, defaultUnits } from "../src/ingredients/units.ts"

/**
 * Prépare la session d'arbitrage de data/units.json.
 *
 * Ne décide rien : pour chaque ingrédient qui mélange plusieurs unités
 * canoniques, liste ce que le corpus emploie, avec les comptes, et l'unité
 * d'achat par défaut. Puis les ingrédients souvent cités sans quantité,
 * candidats au statut invariant. Les entrées déjà arbitrées sont omises.
 */
const program = Effect.gen(function* () {
  const catalog = yield* loadCatalog()
  const aliases = yield* loadAliases()
  const rules = yield* loadUnits()
  const defaults = defaultUnits(catalog, aliases)

  const byUnit = new Map<string, Map<string, number>>()
  const unquantified = new Map<string, number>()
  const total = new Map<string, number>()
  for (const entries of catalog.values()) {
    for (const entry of entries) {
      const name = aliases.get(entry.name) ?? entry.name
      total.set(name, (total.get(name) ?? 0) + 1)
      if (entry.amount === undefined) {
        unquantified.set(name, (unquantified.get(name) ?? 0) + 1)
        continue
      }
      // On garde l'unité imprimée : c'est elle qu'un facteur doit viser.
      const unit = entry.unit ?? "pièce"
      const counts = byUnit.get(name) ?? new Map<string, number>()
      counts.set(unit, (counts.get(unit) ?? 0) + 1)
      byUnit.set(name, counts)
    }
  }

  const families = (counts: Map<string, number>) =>
    new Set([...counts.keys()].map((unit) => canonical(unit, 1).unit))

  const mixed = [...byUnit.entries()]
    .filter(([name, counts]) => !rules.has(name) && families(counts).size > 1)
    .sort(([a], [b]) => (total.get(b) ?? 0) - (total.get(a) ?? 0))

  console.log(`${byUnit.size} ingrédients chiffrés | ${mixed.length} mélangent des familles d'unités\n`)
  console.log("--- à arbitrer : nom  [défaut]  unités vues ×occurrences ---")
  for (const [name, counts] of mixed) {
    const seen = [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([unit, n]) => `${unit}×${n}`)
      .join("  ")
    console.log(`${name}  [${defaults.get(name)}]  ${seen}`)
  }

  const pantry = [...total.entries()]
    .filter(([name, n]) => !rules.has(name) && n >= 3 && (unquantified.get(name) ?? 0) / n >= 0.5)
    .sort(([, a], [, b]) => b - a)
  console.log(`\n--- souvent sans quantité (candidats invariants) : nom  sans/total ---`)
  for (const [name, n] of pantry) console.log(`${name}  ${unquantified.get(name)}/${n}`)
})

Effect.runPromise(program).catch((error) => {
  console.error(error)
  process.exit(1)
})
