import { describe, expect, it } from "vitest"
import { formatAmount } from "../src/quantity.ts"

describe("affichage d'une quantité de la liste", () => {
  it("arrondit masses et volumes à l'entier", () => {
    expect(formatAmount(349.6, "g")).toBe("350 g")
    expect(formatAmount(12.4, "ml")).toBe("12 ml")
  })

  it("passe en kg et en l au-dessus de 1000, une décimale, virgule", () => {
    expect(formatAmount(1200, "g")).toBe("1,2 kg")
    expect(formatAmount(1000, "ml")).toBe("1 l")
    expect(formatAmount(2550, "ml")).toBe("2,6 l")
  })

  it("arrondit au supérieur ce qui se compte, et accorde l'unité", () => {
    expect(formatAmount(1.5, "gousse")).toBe("2 gousses")
    expect(formatAmount(1, "gousse")).toBe("1 gousse")
    expect(formatAmount(2, "cuillère à soupe")).toBe("2 cuillères à soupe")
    expect(formatAmount(0.3, "cube")).toBe("1 cube")
  })

  it("ne dit pas « pièce » : le nombre suffit", () => {
    expect(formatAmount(3, "pièce")).toBe("3")
    expect(formatAmount(2.01, "pièce")).toBe("3")
  })
})
