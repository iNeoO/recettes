import { describe, expect, it } from "vitest"
import { expandIngredients, type Aliases, type Catalog } from "../src/ingredients/catalog.ts"

const catalog: Catalog = new Map([
  ["200g de tofu ferme", [{ name: "tofu ferme", amount: 200, unit: "g" }]],
  ["sel, poivre", [{ name: "sel" }, { name: "poivre" }]],
  ["1 gousse d'ail", [{ name: "ail", amount: 1, unit: "gousse" }]],
  ["(à ajuster si besoin)", []],
])

const line = (raw: string, section: string | null = null) => ({ raw, section })

describe("alias entre variantes d'un même ingrédient", () => {
  // Douze agents indépendants écrivent « purée de tomate » et « purée de
  // tomates ». Un fichier d'alias tranche, plutôt qu'une singularisation
  // automatique qui confondrait « pâte » (à tarte) et « pâtes » (à cuire).
  const aliases: Aliases = new Map([["purée de tomates", "purée de tomate"]])
  const withVariant: Catalog = new Map([
    ["1 purée", [{ name: "purée de tomates" }]],
    ["2 purée", [{ name: "purée de tomate" }]],
  ])

  it("ramène une variante au nom retenu", () => {
    const rows = expandIngredients([line("1 purée")], 2, withVariant, aliases)
    expect(rows[0]!.name).toBe("purée de tomate")
  })

  it("laisse intact un nom sans alias", () => {
    const rows = expandIngredients([line("2 purée")], 2, withVariant, aliases)
    expect(rows[0]!.name).toBe("purée de tomate")
  })

  it("n'invente aucun alias en l'absence de fichier", () => {
    const rows = expandIngredients([line("1 purée")], 2, withVariant)
    expect(rows[0]!.name).toBe("purée de tomates")
  })
})

describe("expansion d'une liste d'ingrédients", () => {
  it("découpe une ligne qui en porte plusieurs, en gardant sa provenance", () => {
    const rows = expandIngredients([line("Sel, poivre")], 2, catalog)

    expect(rows).toEqual([
      { name: "sel", quantity: null, section: null, position: 0, raw: "Sel, poivre" },
      { name: "poivre", quantity: null, section: null, position: 1, raw: "Sel, poivre" },
    ])
  })

  it("numérote les positions à la suite, à travers les lignes éclatées", () => {
    const rows = expandIngredients(
      [line("200g de tofu ferme"), line("Sel, poivre"), line("1 gousse d'ail")],
      2,
      catalog
    )

    expect(rows.map((r) => [r.position, r.name])).toEqual([
      [0, "tofu ferme"],
      [1, "sel"],
      [2, "poivre"],
      [3, "ail"],
    ])
  })

  it("ramène les quantités à 2 portions", () => {
    const pour4 = expandIngredients([line("200g de tofu ferme")], 4, catalog)
    expect(pour4[0]!.quantity).toBe("100g")

    const pour1 = expandIngredients([line("200g de tofu ferme")], 1, catalog)
    expect(pour1[0]!.quantity).toBe("400g")
  })

  it("accepte une demi-unité pour ce qui ne se divise pas", () => {
    const rows = expandIngredients([line("1 gousse d'ail")], 4, catalog)
    expect(rows[0]!.quantity).toBe("1/2 gousse")
  })

  it("ne met pas à l'échelle une recette sans nombre de portions", () => {
    const rows = expandIngredients([line("200g de tofu ferme")], null, catalog)
    expect(rows[0]!.quantity).toBe("200g")
  })

  it("écarte une ligne que le catalogue déclare sans substance", () => {
    expect(expandIngredients([line("(à ajuster si besoin)")], 2, catalog)).toEqual([])
  })

  it("retrouve une ligne malgré une apostrophe courbe ou une casse différente", () => {
    const rows = expandIngredients([line("1 GOUSSE D’AIL")], 2, catalog)
    expect(rows[0]!.name).toBe("ail")
  })

  it("conserve la sous-section sur chaque ingrédient issu de la ligne", () => {
    const rows = expandIngredients([line("Sel, poivre", "Pour la sauce")], 2, catalog)
    expect(rows.map((r) => r.section)).toEqual(["Pour la sauce", "Pour la sauce"])
  })

  it("signale une ligne absente du catalogue plutôt que de la perdre", () => {
    expect(() => expandIngredients([line("3 licornes")], 2, catalog)).toThrow(/3 licornes/)
  })
})
