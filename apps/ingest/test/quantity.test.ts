import { describe, expect, it } from "vitest"
import { formatQuantity, scale } from "../src/ingredients/quantity.ts"

describe("mise à l'échelle vers 2 portions", () => {
  it("divise par deux une recette pour 4", () => {
    expect(scale(200, 4)).toBe(100)
    expect(scale(1, 4)).toBe(0.5)
  })

  it("double une recette pour 1", () => {
    expect(scale(1, 1)).toBe(2)
    expect(scale(75, 1)).toBe(150)
  })

  it("ne touche pas une recette déjà pour 2", () => {
    expect(scale(140, 2)).toBe(140)
  })

  it("ne touche pas une recette sans nombre de portions", () => {
    expect(scale(140, null)).toBe(140)
  })
})

describe("formatage d'une quantité", () => {
  it("colle l'unité aux masses et volumes, et arrondit", () => {
    expect(formatQuantity(200, "g")).toBe("200g")
    expect(formatQuantity(37.5, "g")).toBe("38g")
    expect(formatQuantity(250, "ml")).toBe("250ml")
  })

  it("écrit les fractions usuelles en toutes lettres de fraction", () => {
    expect(formatQuantity(0.5, undefined)).toBe("1/2")
    expect(formatQuantity(0.25, undefined)).toBe("1/4")
    expect(formatQuantity(0.75, undefined)).toBe("3/4")
    // 1/3 vient des intervalles divisés : 0.333 ne doit pas s'afficher tel quel.
    expect(formatQuantity(1 / 3, undefined)).toBe("1/3")
  })

  it("accole la partie entière à la fraction", () => {
    expect(formatQuantity(1.5, "gousse")).toBe("1 1/2 gousse")
  })

  it("accorde l'unité au pluriel, sur son premier mot", () => {
    expect(formatQuantity(1, "gousse")).toBe("1 gousse")
    expect(formatQuantity(2, "gousse")).toBe("2 gousses")
    expect(formatQuantity(2, "cuillère à soupe")).toBe("2 cuillères à soupe")
    expect(formatQuantity(1, "cuillère à café")).toBe("1 cuillère à café")
  })

  it("n'accorde pas les symboles d'unité", () => {
    expect(formatQuantity(2, "g")).toBe("2g")
    expect(formatQuantity(2, "ml")).toBe("2ml")
  })

  it("rend le nombre seul quand il n'y a pas d'unité", () => {
    expect(formatQuantity(2, undefined)).toBe("2")
  })

  it("rend l'unité seule quand il n'y a pas de nombre", () => {
    expect(formatQuantity(undefined, "pincée")).toBe("pincée")
  })

  it("ne rend rien quand il n'y a ni nombre ni unité", () => {
    expect(formatQuantity(undefined, undefined)).toBeNull()
  })

  it("ne descend pas en dessous d'une quantité utilisable", () => {
    // Une recette pour 6 ramenée à 2 : un tiers d'œuf n'a pas de sens en
    // grammes mais reste lisible en fraction.
    expect(formatQuantity(scale(1, 6), undefined)).toBe("1/3")
    expect(formatQuantity(scale(100, 6), "g")).toBe("33g")
  })
})
