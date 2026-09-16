/** Toutes les recettes sont ramenées à cette base. */
export const BASE_SERVINGS = 2

/** Unités qui se collent au nombre et ne s'accordent pas : 200g, 250ml. */
const SYMBOLS = new Set(["g", "kg", "mg", "ml", "cl", "dl", "l"])

/** Fractions rendues telles quelles plutôt qu'en décimal. */
const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
]

const TOLERANCE = 0.02

/**
 * Ramène une quantité à 2 portions. Une recette sans nombre de portions
 * (muffins, pains, boissons) n'est pas mise à l'échelle : son rendement ne
 * s'exprime pas en parts.
 */
export const scale = (amount: number, servings: number | null): number =>
  servings === null || servings === 0 ? amount : (amount * BASE_SERVINGS) / servings

/** Accorde l'unité sur son premier mot : « cuillères à soupe ». */
const plural = (unit: string): string => {
  const [head, ...rest] = unit.split(" ")
  return [head!.endsWith("s") ? head : `${head}s`, ...rest].join(" ")
}

const asFraction = (value: number): string | null => {
  const whole = Math.floor(value + TOLERANCE)
  const rest = value - whole
  if (rest < TOLERANCE) return whole === 0 ? null : String(whole)
  const found = FRACTIONS.find(([f]) => Math.abs(rest - f) < TOLERANCE)
  if (found === undefined) return null
  return whole === 0 ? found[1] : `${whole} ${found[1]}`
}

/**
 * Rend la quantité affichable. Les masses et volumes sont arrondis à l'entier :
 * un tiers de 100g vaut 33g, pas 33,333g.
 */
export const formatQuantity = (
  amount: number | undefined,
  unit: string | undefined
): string | null => {
  if (amount === undefined) return unit ?? null

  if (unit !== undefined && SYMBOLS.has(unit)) {
    return `${Math.round(amount)}${unit}`
  }

  const number =
    asFraction(amount) ?? String(Math.round(amount * 100) / 100).replace(".", ",")

  // En français le pluriel commence à 2 : « 1 1/2 gousse », « 2 gousses ».
  return unit === undefined ? number : `${number} ${amount >= 2 ? plural(unit) : unit}`
}
