import { Effect } from "effect"
import { fileURLToPath } from "node:url"
import { assemble } from "../src/assemble.ts"
import { loadPages } from "../src/pdf.ts"
import type { Recipe } from "../src/assemble.ts"

const all: Array<Recipe> = []
for (const book of [1, 2]) {
  const path = fileURLToPath(new URL(`../../../list${book}.pdf`, import.meta.url))
  const { recipes } = await Effect.runPromise(loadPages(path, book).pipe(Effect.flatMap(assemble)))
  all.push(...recipes)
}
const ings = all.flatMap((r) => r.ingredients)
console.log(`recettes=${all.length} ingrédients=${ings.length} moy=${(ings.length / all.length).toFixed(1)}`)
console.log(`sans portions: ${all.filter((r) => r.servings === null).length}`)
console.log(`avec sous-section: ${all.filter((r) => r.ingredients.some((i) => i.section)).length}`)

const len = (n: number) => all.filter((r) => r.ingredients.length === n).length
console.log(`\ningrédients par recette: 1→${len(1)} 2→${len(2)} 3→${len(3)}  min=${Math.min(...all.map(r=>r.ingredients.length))} max=${Math.max(...all.map(r=>r.ingredients.length))}`)

console.log("\n--- ingrédients les plus longs (fusion douteuse ?) ---")
for (const i of [...ings].sort((a, b) => b.raw.length - a.raw.length).slice(0, 6))
  console.log(`  ${i.raw.length} ${JSON.stringify(i.raw.slice(0, 95))}`)

console.log("\n--- ingrédients commençant en minuscule (coupure ratée ?) ---")
const low = ings.filter((i) => /^[a-zà-öø-ÿ]/.test(i.raw))
console.log(`  ${low.length} sur ${ings.length}`)
for (const i of low.slice(0, 6)) console.log(`  ${JSON.stringify(i.raw.slice(0, 70))}`)

console.log("\n--- titres suspects ---")
for (const r of all.filter((r) => r.title.length > 60 || r.title.length < 5).slice(0, 5))
  console.log(`  l${r.book} p${r.page} ${JSON.stringify(r.title)}`)

const r = all[321]!
console.log(`\n--- échantillon: l${r.book} p${r.page} « ${r.title} » [${r.category}] ${r.servings} portions ---`)
for (const i of r.ingredients) console.log(`  [${i.section ?? "-"}] ${i.raw}`)
console.log(r.instructions.split("\n\n").map((s, n) => `  §${n} ${s.slice(0, 90)}`).join("\n"))
