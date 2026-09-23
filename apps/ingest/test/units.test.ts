import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { expandIngredients, type Aliases, type Catalog } from "../src/ingredients/catalog.ts"
import {
  canonical,
  defaultUnits,
  makeUnits,
  normalize,
  PIECE,
  UnitRulesFile,
  type UnitRule,
} from "../src/ingredients/units.ts"

const catalog: Catalog = new Map([
  ["200g de farine", [{ name: "farine", amount: 200, unit: "g" }]],
  ["100g de farine", [{ name: "farine", amount: 100, unit: "g" }]],
  ["2 cuillères à soupe de farine", [{ name: "farine", amount: 2, unit: "cuillère à soupe" }]],
  ["20g d'ail", [{ name: "ail", amount: 20, unit: "g" }]],
  ["2 gousses d'ail", [{ name: "ail", amount: 2, unit: "gousse" }]],
  ["3 gousses d'ail", [{ name: "ail", amount: 3, unit: "gousse" }]],
  ["1 filet d'huile d'olive", [{ name: "huile d'olive", amount: 1, unit: "filet" }]],
  ["paprika", [{ name: "paprika" }]],
  ["50cl de lait", [{ name: "lait", amount: 50, unit: "cl" }]],
  ["200ml de lait", [{ name: "lait", amount: 200, unit: "ml" }]],
  ["1 oignon", [{ name: "oignon", amount: 1 }]],
  ["2 oignons", [{ name: "oignons", amount: 2 }]],
])
const aliases: Aliases = new Map([["oignons", "oignon"]])
const rules = new Map<string, UnitRule>([
  ["farine", { unit: "g", factors: { "cuillère à soupe": 10 } }],
  ["ail", { unit: "gousse", factors: { g: 0.2 } }],
  ["huile d'olive", { invariant: true }],
  ["paprika", { invariant: true }],
])
const units = makeUnits(catalog, aliases, rules)
const line = (raw: string) => ({ raw, section: null })

describe("unités canoniques", () => {
  it("ramène les volumes en ml et les masses en g", () => {
    expect(canonical("cl", 50)).toEqual({ unit: "ml", amount: 500 })
    expect(canonical("l", 1.5)).toEqual({ unit: "ml", amount: 1500 })
    expect(canonical("kg", 1)).toEqual({ unit: "g", amount: 1000 })
    expect(canonical("cuillère à soupe", 2)).toEqual({ unit: "ml", amount: 30 })
    expect(canonical("cuillère à café", 1)).toEqual({ unit: "ml", amount: 5 })
  })

  it("compte en pièces ce qui n'a pas d'unité", () => {
    expect(canonical(undefined, 2)).toEqual({ unit: PIECE, amount: 2 })
  })

  it("laisse intacte une unité qu'elle ne connaît pas", () => {
    expect(canonical("gousse", 3)).toEqual({ unit: "gousse", amount: 3 })
  })
})

describe("unité d'achat par défaut", () => {
  it("prend l'unité canonique la plus fréquente, alias compris", () => {
    const defaults = defaultUnits(catalog, aliases)
    expect(defaults.get("farine")).toBe("g")
    expect(defaults.get("ail")).toBe("gousse")
    expect(defaults.get("lait")).toBe("ml")
    expect(defaults.get("oignon")).toBe(PIECE)
    expect(defaults.has("oignons")).toBe(false)
  })

  it("ignore les lignes sans nombre", () => {
    expect(defaultUnits(catalog, aliases).has("paprika")).toBe(false)
  })
})

describe("normalisation d'une ligne", () => {
  it("convertit un saut de famille par le facteur de la règle", () => {
    expect(normalize("farine", { name: "farine", amount: 2, unit: "cuillère à soupe" }, 2, units))
      .toEqual({ _tag: "Quantified", amount: 20, unit: "g" })
    expect(normalize("ail", { name: "ail", amount: 20, unit: "g" }, 2, units))
      .toEqual({ _tag: "Quantified", amount: 4, unit: "gousse" })
  })

  it("convertit une même famille sans règle", () => {
    expect(normalize("lait", { name: "lait", amount: 50, unit: "cl" }, 2, units))
      .toEqual({ _tag: "Quantified", amount: 500, unit: "ml" })
  })

  it("ramène à 2 portions après conversion", () => {
    expect(normalize("farine", { name: "farine", amount: 4, unit: "cuillère à soupe" }, 4, units))
      .toEqual({ _tag: "Quantified", amount: 20, unit: "g" })
    expect(normalize("oignon", { name: "oignon", amount: 1 }, 1, units))
      .toEqual({ _tag: "Quantified", amount: 2, unit: PIECE })
  })

  it("est invariante par règle, même avec une quantité", () => {
    expect(normalize("huile d'olive", { name: "huile d'olive", amount: 1, unit: "filet" }, 2, units))
      .toEqual({ _tag: "Invariant", reason: "rule" })
  })

  it("est invariante sans nombre de portions", () => {
    expect(normalize("farine", { name: "farine", amount: 200, unit: "g" }, null, units))
      .toEqual({ _tag: "Invariant", reason: "no-servings" })
  })

  it("est invariante sans nombre", () => {
    expect(normalize("paprika", { name: "paprika" }, 2, makeUnits(catalog, aliases)))
      .toEqual({ _tag: "Invariant", reason: "no-amount" })
  })

  it("est invariante, et le dit, quand aucun facteur ne relie les familles", () => {
    const without = makeUnits(catalog, aliases)
    expect(normalize("farine", { name: "farine", amount: 2, unit: "cuillère à soupe" }, 2, without))
      .toEqual({ _tag: "Invariant", reason: "no-factor" })
  })

  it("accepte un facteur exprimé sur l'unité canonique", () => {
    const byCanonical = makeUnits(catalog, aliases, new Map<string, UnitRule>([["farine", { unit: "g", factors: { ml: 0.6 } }]]))
    // 2 cuillères à soupe = 30 ml, × 0,6 = 18 g
    expect(normalize("farine", { name: "farine", amount: 2, unit: "cuillère à soupe" }, 2, byCanonical))
      .toEqual({ _tag: "Quantified", amount: 18, unit: "g" })
  })
})

describe("expansion avec unités", () => {
  it("garde le texte affiché et ajoute la quantité normalisée", () => {
    const rows = expandIngredients([line("2 cuillères à soupe de farine")], 2, catalog, aliases, units)
    expect(rows[0]).toMatchObject({ quantity: "2 cuillères à soupe", amount: 20, unit: "g" })
  })

  it("met null, null sur une ligne invariante", () => {
    const rows = expandIngredients([line("1 filet d'huile d'olive")], 2, catalog, aliases, units)
    expect(rows[0]).toMatchObject({ quantity: "1 filet", amount: null, unit: null })
  })
})

describe("fichier units.json", () => {
  const decode = Schema.decodeUnknownEither(UnitRulesFile)

  it("accepte une règle complète", () => {
    expect(decode({ farine: { unit: "g", factors: { "cuillère à soupe": 10 } } })._tag).toBe("Right")
    expect(decode({ paprika: { invariant: true } })._tag).toBe("Right")
  })

  it("refuse un facteur nul ou négatif", () => {
    expect(decode({ farine: { factors: { ml: 0 } } })._tag).toBe("Left")
  })

  it("refuse une unité d'achat qui se convertit toujours ailleurs", () => {
    // « cl » devient « ml » avant toute comparaison : la règle ne matcherait jamais.
    expect(decode({ lait: { unit: "cl" } })._tag).toBe("Left")
  })
})
