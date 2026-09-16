import { DatabaseLive, PgDrizzle, schema } from "@recettes/db"
import { and, desc, eq, isNotNull, ne, notExists, sql } from "drizzle-orm"
import { Effect } from "effect"

/** Contrôle ce que la normalisation a réellement produit en base. */
const program = Effect.gen(function* () {
  const db = yield* PgDrizzle
  const count = (rows: ReadonlyArray<{ n: number }>) => rows[0]?.n ?? 0
  const n = sql<number>`count(*)::int`.as("n")

  const recettes = count(yield* db.select({ n }).from(schema.recipes))
  const liaisons = count(yield* db.select({ n }).from(schema.recipeIngredients))
  const canoniques = count(yield* db.select({ n }).from(schema.ingredients))
  const avecQuantite = count(
    yield* db.select({ n }).from(schema.recipeIngredients)
      .where(isNotNull(schema.recipeIngredients.quantity))
  )
  const portionsNonDeux = count(
    yield* db.select({ n }).from(schema.recipes)
      .where(and(isNotNull(schema.recipes.servings), ne(schema.recipes.servings, 2)))
  )
  const sansIngredient = count(
    yield* db.select({ n }).from(schema.recipes).where(
      notExists(
        db.select({ one: sql`1` }).from(schema.recipeIngredients)
          .where(eq(schema.recipeIngredients.recipeId, schema.recipes.id))
      )
    )
  )

  console.log(`recettes                 : ${recettes}`)
  console.log(`liaisons recette↔ingr.   : ${liaisons}`)
  console.log(`ingrédients canoniques   : ${canoniques}`)
  console.log(`liaisons avec quantité   : ${avecQuantite}`)
  console.log(`recettes sans ingrédient : ${sansIngredient}`)
  console.log(`portions ≠ 2 restantes   : ${portionsNonDeux}   (doit être 0)`)

  const top = yield* db
    .select({ name: schema.ingredients.name, usages: n })
    .from(schema.recipeIngredients)
    .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.recipeIngredients.ingredientId))
    .groupBy(schema.ingredients.name)
    .orderBy(desc(sql`count(*)`))
    .limit(12)

  console.log("\n--- ingrédients les plus employés ---")
  for (const row of top) console.log(`  ${String(row.usages).padStart(4)}  ${row.name}`)

  const title = process.env.RECIPE ?? "Bowl de pastèque"
  const sample = yield* db
    .select({
      title: schema.recipes.title,
      servings: schema.recipes.servings,
      name: schema.ingredients.name,
      quantity: schema.recipeIngredients.quantity,
      raw: schema.recipeIngredients.raw,
    })
    .from(schema.recipeIngredients)
    .innerJoin(schema.recipes, eq(schema.recipes.id, schema.recipeIngredients.recipeId))
    .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.recipeIngredients.ingredientId))
    .where(sql`${schema.recipes.title} ILIKE ${`%${title}%`}`)
    .orderBy(schema.recipeIngredients.position)
    .limit(30)

  if (sample.length > 0) {
    console.log(`\n--- « ${sample[0]!.title} » (${sample[0]!.servings ?? "?"} portions) ---`)
    for (const row of sample) {
      console.log(`  ${(row.quantity ?? "—").padEnd(22)} ${row.name.padEnd(26)} ← ${row.raw}`)
    }
  }
})

Effect.runPromise(program.pipe(Effect.provide(DatabaseLive))).then(
  () => process.exit(0),
  (error) => { console.error(error); process.exit(1) }
)
