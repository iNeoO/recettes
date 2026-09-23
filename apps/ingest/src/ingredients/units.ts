import { Schema } from "effect"
import type { Aliases, Catalog, ParsedIngredient } from "./catalog.ts"
import { scale } from "./quantity.ts"

/**
 * L'unité des choses qui se comptent : « 2 oignons », « 1 citron ». Une ligne
 * sans unité en porte une implicitement.
 */
export const PIECE = "pièce"

/**
 * Conversions qui ne dépendent pas de l'ingrédient : elles vivent ici, pas
 * dans units.json. « 1 <unité> = k <unité canonique> ».
 */
const UNIVERSAL: Readonly<Record<string, readonly [string, number]>> = {
  cl: ["ml", 10],
  dl: ["ml", 100],
  l: ["ml", 1000],
  litre: ["ml", 1000],
  kg: ["g", 1000],
  mg: ["g", 0.001],
  "cuillère à soupe": ["ml", 15],
  "cuillère à café": ["ml", 5],
}

/** Ce qu'une entrée de units.json peut dire d'un ingrédient. */
export const UnitRule = Schema.Struct({
  /** L'unité d'achat, celle de la ligne finale. Défaut : la plus fréquente du corpus. */
  unit: Schema.optional(Schema.NonEmptyTrimmedString),
  /** « 1 <unité vue> = k <unité d'achat> », pour les sauts de famille seulement. */
  factors: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Positive })),
  /** On en veut, peu importe combien : la ligne va au placard, sans quantité. */
  invariant: Schema.optional(Schema.Literal(true)),
}).pipe(
  Schema.filter((rule) =>
    rule.unit !== undefined && rule.unit in UNIVERSAL
      ? `« ${rule.unit} » se convertit toujours en « ${UNIVERSAL[rule.unit]![0]} » : l'unité d'achat doit être celle-là`
      : undefined
  )
)
export type UnitRule = typeof UnitRule.Type

export const UnitRulesFile = Schema.Record({ key: Schema.String, value: UnitRule })

/** Nom retenu → règle. Relu à la main, comme les alias. */
export type UnitRules = ReadonlyMap<string, UnitRule>

/** Ramène une unité à sa forme canonique : cl → ml, kg → g, absente → pièce. */
export const canonical = (
  unit: string | undefined,
  amount: number
): { readonly unit: string; readonly amount: number } => {
  if (unit === undefined) return { unit: PIECE, amount }
  const universal = UNIVERSAL[unit]
  return universal === undefined
    ? { unit, amount }
    : { unit: universal[0], amount: amount * universal[1] }
}

export type InvariantReason = "rule" | "no-servings" | "no-amount" | "no-factor"

export type Normalized =
  | { readonly _tag: "Quantified"; readonly amount: number; readonly unit: string }
  | { readonly _tag: "Invariant"; readonly reason: InvariantReason }

export const invariant = (reason: InvariantReason): Normalized => ({ _tag: "Invariant", reason })

/**
 * Pour chaque ingrédient, l'unité canonique la plus fréquente parmi ses lignes
 * chiffrées. C'est l'unité d'achat par défaut quand units.json ne dit rien.
 * Départage à égalité par le nom de l'unité, pour rester déterministe.
 */
export const defaultUnits = (catalog: Catalog, aliases: Aliases): ReadonlyMap<string, string> => {
  const counts = new Map<string, Map<string, number>>()
  for (const entries of catalog.values()) {
    for (const entry of entries) {
      if (entry.amount === undefined) continue
      const name = aliases.get(entry.name) ?? entry.name
      const unit = canonical(entry.unit, entry.amount).unit
      const byUnit = counts.get(name) ?? new Map<string, number>()
      byUnit.set(unit, (byUnit.get(unit) ?? 0) + 1)
      counts.set(name, byUnit)
    }
  }
  const defaults = new Map<string, string>()
  for (const [name, byUnit] of counts) {
    const [best] = [...byUnit.entries()].sort(([ua, a], [ub, b]) => b - a || ua.localeCompare(ub))
    defaults.set(name, best![0])
  }
  return defaults
}

/** Tout ce qu'il faut pour normaliser une ligne, construit une fois par ingestion. */
export interface Units {
  readonly rules: UnitRules
  readonly defaults: ReadonlyMap<string, string>
}

export const makeUnits = (
  catalog: Catalog,
  aliases: Aliases = new Map(),
  rules: UnitRules = new Map()
): Units => ({ rules, defaults: defaultUnits(catalog, aliases) })

/**
 * Convertit une ligne dans l'unité d'achat de son ingrédient, ramenée à 2
 * portions. Invariante (pas de quantité, juste la présence) si l'ingrédient
 * l'est par règle, si la recette n'a pas de portions, si la ligne n'a pas de
 * nombre, ou si aucun facteur ne relie son unité à l'unité d'achat.
 */
export const normalize = (
  name: string,
  parsed: ParsedIngredient,
  servings: number | null,
  units: Units
): Normalized => {
  const rule = units.rules.get(name)
  if (rule?.invariant === true) return invariant("rule")
  if (servings === null) return invariant("no-servings")
  if (parsed.amount === undefined) return invariant("no-amount")

  const seen = canonical(parsed.unit, parsed.amount)
  const target = rule?.unit ?? units.defaults.get(name) ?? seen.unit
  if (seen.unit === target) {
    return { _tag: "Quantified", amount: scale(seen.amount, servings), unit: target }
  }

  // Le facteur peut viser l'unité imprimée (« cuillère à soupe ») ou sa forme
  // canonique (« ml ») : on essaie la plus précise d'abord.
  const byPrinted = rule?.factors?.[parsed.unit ?? PIECE]
  if (byPrinted !== undefined) {
    return { _tag: "Quantified", amount: scale(parsed.amount * byPrinted, servings), unit: target }
  }
  const byCanonical = rule?.factors?.[seen.unit]
  if (byCanonical !== undefined) {
    return { _tag: "Quantified", amount: scale(seen.amount * byCanonical, servings), unit: target }
  }
  return invariant("no-factor")
}
