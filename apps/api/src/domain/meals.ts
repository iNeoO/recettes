import { Chunk, Effect, Random } from "effect"

/** Ce qui ne fait pas un repas : jamais tiré au hasard, toujours ajoutable à la main. */
export const NOT_MEALS: ReadonlyArray<string> = [
  "Recettes sucrées",
  "Boissons",
  "Pains & boulanges",
  "Apéritifs /collations & petits-déjeuners salés",
]

/** N recettes distinctes du pool, au hasard ; moins si le pool est plus petit. */
export const drawMeals = (pool: ReadonlyArray<number>, count: number) =>
  Random.shuffle(pool).pipe(Effect.map((shuffled) => Chunk.toReadonlyArray(shuffled).slice(0, count)))
