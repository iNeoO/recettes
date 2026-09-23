import { Effect } from "effect"
import { loadAliases, loadCatalog, loadUnits } from "../src/ingredients/load.ts"
import { makeUnits, normalize } from "../src/ingredients/units.ts"

/**
 * Ce que data/units.json laisse encore invariant faute de facteur : pour chaque
 * ingrédient, les unités imprimées qu'aucune règle ne relie à son unité
 * d'achat, avec les comptes. C'est la liste de travail après une première
 * passe d'arbitrage. Code de sortie 0 : informatif, pas bloquant.
 */
const program = Effect.gen(function* () {
  const catalog = yield* loadCatalog()
  const aliases = yield* loadAliases()
  const rules = yield* loadUnits()
  const units = makeUnits(catalog, aliases, rules)

  const orphans = new Map<string, Map<string, number>>()
  let lines = 0
  for (const entries of catalog.values()) {
    for (const entry of entries) {
      const name = aliases.get(entry.name) ?? entry.name
      // 2 portions : le nombre de portions ne change pas la présence d'un facteur.
      const result = normalize(name, entry, 2, units)
      if (result._tag !== "Invariant" || result.reason !== "no-factor") continue
      lines += 1
      const unit = entry.unit ?? "pièce"
      const counts = orphans.get(name) ?? new Map<string, number>()
      counts.set(unit, (counts.get(unit) ?? 0) + 1)
      orphans.set(name, counts)
    }
  }

  const sorted = [...orphans.entries()].sort(
    ([, a], [, b]) =>
      [...b.values()].reduce((x, y) => x + y, 0) - [...a.values()].reduce((x, y) => x + y, 0)
  )
  console.log(`${lines} lignes invariantes faute de facteur, sur ${sorted.length} ingrédients\n`)
  for (const [name, counts] of sorted) {
    const seen = [...counts.entries()].map(([unit, n]) => `${unit}×${n}`).join("  ")
    console.log(`${name}  [${units.rules.get(name)?.unit ?? units.defaults.get(name)}]  ${seen}`)
  }
})

Effect.runPromise(program).catch((error) => {
  console.error(error)
  process.exit(1)
})
