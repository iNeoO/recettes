/**
 * Rend une quantité de la liste de courses. Masses et volumes à l'entier,
 * en kg ou l au-dessus de 1000 ; ce qui se compte est arrondi au supérieur —
 * on ne coupe pas une gousse au magasin. Pour « pièce », le nombre seul.
 */
export const formatAmount = (amount: number, unit: string): string => {
  if (unit === "g" || unit === "ml") {
    if (amount >= 1000) return `${decimal(amount / 1000)} ${unit === "g" ? "kg" : "l"}`
    return `${Math.round(amount)} ${unit}`
  }
  const count = Math.ceil(amount - 1e-9)
  if (unit === "pièce") return String(count)
  return `${count} ${count >= 2 ? plural(unit) : unit}`
}

/** Une décimale, virgule française, sans « ,0 » : 1,2 kg mais 2 kg. */
const decimal = (value: number): string => {
  const rounded = Math.round(value * 10) / 10
  return String(rounded).replace(".", ",")
}

/** Accorde l'unité sur son premier mot : « cuillères à soupe ». */
const plural = (unit: string): string => {
  const [head, ...rest] = unit.split(" ")
  return [head!.endsWith("s") || head!.endsWith("x") ? head : `${head}s`, ...rest].join(" ")
}
