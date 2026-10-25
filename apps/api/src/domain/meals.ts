import { Effect, Random } from "effect"

/** Ce qui ne fait pas un repas : jamais tiré au hasard, toujours ajoutable à la main. */
export const NOT_MEALS: ReadonlyArray<string> = [
  "Recettes sucrées",
  "Boissons",
  "Pains & boulanges",
  "Apéritifs /collations & petits-déjeuners salés",
]

/** Une recette du pool, au hasard ; `exclude` sert à ne pas remplacer un plat par lui-même. */
export const drawMeal = (pool: ReadonlyArray<number>, exclude?: number) =>
  Effect.gen(function* () {
    const candidates = exclude === undefined ? pool : pool.filter((id) => id !== exclude)
    const drawn = candidates[yield* Random.nextIntBetween(0, candidates.length)]
    if (drawn === undefined) return yield* Effect.die("aucun plat à tirer")
    return drawn
  })

/** N tirages indépendants : la même recette peut sortir deux fois, c'est accepté. */
export const drawMeals = (pool: ReadonlyArray<number>, count: number) =>
  Effect.forEach(Array.from({ length: count }), () => drawMeal(pool))
