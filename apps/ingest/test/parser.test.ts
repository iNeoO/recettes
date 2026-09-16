import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { readFileSync } from "node:fs"
import { parsePage } from "../src/parser/index.ts"
import type { PageInput, ParsedPage } from "../src/parser/types.ts"

const fixture = (name: string): PageInput =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"))

const parse = (name: string) => parsePage(fixture(name))

/** Rétrécit le type pour que les assertions suivantes soient typées. */
const expectKind = <K extends ParsedPage["kind"]>(
  page: ParsedPage,
  kind: K
): Extract<ParsedPage, { kind: K }> => {
  expect(page.kind).toBe(kind)
  return page as Extract<ParsedPage, { kind: K }>
}

describe("pages séparatrices", () => {
  it.effect("livre 1 p1 donne la catégorie", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("separateur-categorie"), "divider")
      expect(page.category).toBe("Salades & bowls")
    }))

  it.effect("livre 2 p272 donne la catégorie", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("separateur-livre2"), "divider")
      expect(page.category).toBe("Recettes sucrées")
    }))
})

describe("recette canonique (livre 1 p2)", () => {
  it.effect("recolle le titre dont les lettres sont espacées dans le PDF", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("canonique-une-colonne"), "recipe")
      expect(page.title).toBe("Bowl de pastèque tomate & feta")
      expect(page.servings).toBe(2)
    }))

  it.effect("regroupe les ingrédients coupés en fin de ligne", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("canonique-une-colonne"), "recipe")
      // "2 cuillères à soupe d’huile" / "d'olive" sont une seule ligne visuelle coupée.
      expect(page.ingredients.map((i) => i.raw)).toEqual([
        "1/4 de pastèque",
        "1 tomate coeur de boeuf",
        "60g d’olives",
        "Basilic",
        "60g de feta végane",
        "300g de tofu Rosso Taifun",
        "2 cuillères à soupe d’huile d'olive",
        "1.5 cuillères à soupe de vinaigre balsamique",
        "Sel, poivre",
      ])
      expect(page.ingredients.every((i) => i.section === null)).toBe(true)
    }))

  it.effect("sépare les étapes par un saut de paragraphe", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("canonique-une-colonne"), "recipe")
      const steps = page.instructions.split("\n\n")
      expect(steps).toHaveLength(4)
      expect(steps[0]).toBe(
        "Couper les tomates en tranches. Retirer la peau de la pastèque et la couper en cubes."
      )
      expect(steps[3]).toBe(
        "Verser l'huile d'olive et le vinaigre balsamique, du sel, du poivre."
      )
    }))
})

describe("cas de mise en page", () => {
  it.effect("attribue la sous-section désindentée aux ingrédients qui suivent", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("sous-section-ingredients"), "recipe")
      const sections = new Map(page.ingredients.map((i) => [i.raw, i.section]))
      expect(sections.get("100g de quinoa")).toBeNull()
      expect(sections.get("1 orange")).toBe("Pour la vinaigrette")
      expect(sections.get("Sel, poivre")).toBe("Pour la vinaigrette")
      // Le libellé de section n'est pas lui-même un ingrédient.
      expect(page.ingredients.map((i) => i.raw)).not.toContain("Pour la vinaigrette")
    }))

  it.effect("lit les ingrédients colonne par colonne, pas ligne par ligne", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("ingredients-deux-colonnes"), "recipe")
      const raws = page.ingredients.map((i) => i.raw)
      // Colonne gauche entière avant la colonne droite, alors qu'elles partagent les mêmes y.
      expect(raws[0]).toBe("100g de couscous perlé")
      expect(raws.indexOf("Roquette")).toBeLessThan(raws.indexOf("200g de halloumi"))
      expect(raws).toContain("30g de mélange de graines de tournesol et de courge")
      expect(raws).toContain("Sel, poivre")
    }))

  it.effect("sépare deux colonnes même quand le blanc est étroit sur la ligne", () =>
    Effect.gen(function* () {
      // l1 p114 : les lignes longues de la colonne gauche laissent moins de 15pt.
      const page = expectKind(yield* parse("colonnes-rapprochees"), "recipe")
      const raws = page.ingredients.map((i) => i.raw)
      expect(raws[0]).toBe("140g de riz à sushi")
      expect(raws).toContain("2 cuillères à café rase de sucre")
      expect(raws).toContain("Gingembre")
      // Aucun ingrédient ne doit mêler du texte des deux colonnes.
      expect(raws.filter((r) => /sucre/.test(r) && /mangue/.test(r))).toEqual([])
      // Un ingrédient long mais réel reste d'un seul tenant, sur 5 lignes.
      expect(raws.at(-1)).toBe(
        "Topping : 1/2 avocat, tomates cerises, mangue, edamame, tofu mange curry, oeuf mollet, chou rouge, pousses de soja..."
      )
    }))

  it.effect("sépare deux colonnes séparées par un couloir de 6pt seulement", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("colonnes-jointives"), "recipe")
      const raws = page.ingredients.map((i) => i.raw)
      expect(raws).toContain("1 cuillère à café de concentré de tomate")
      expect(raws.filter((r) => /Portobello/.test(r) && /concentré/.test(r))).toEqual([])
    }))

  it.effect("recolle une ligne coupée avant une parenthèse", () =>
    Effect.gen(function* () {
      // l1 p54 : « 1 boite de pois chiches cuits » / « (220g environ) ».
      const page = expectKind(yield* parse("ingredient-coupe-sur-parenthese"), "recipe")
      const raws = page.ingredients.map((i) => i.raw)
      expect(raws).toContain("1 boite de pois chiches cuits (220g environ)")
      expect(raws).not.toContain("(220g environ)")
    }))

  it.effect("recolle une ligne coupée après une préposition", () =>
    Effect.gen(function* () {
      // l2 p239 : « 12 champignons de » / « Paris ». La majuscule empêche la
      // règle de la minuscule initiale de reconnaître la suite.
      const page = expectKind(yield* parse("ingredient-coupe-sur-preposition"), "recipe")
      const raws = page.ingredients.map((i) => i.raw)
      expect(raws).toContain("12 champignons de Paris")
      expect(raws).not.toContain("12 champignons de")
    }))

  it.effect("ordonne les instructions réparties en blocs par leur position verticale", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("instructions-colonne-droite"), "recipe")
      expect(page.instructions).toMatch(/^Préchauffer le four à 200°C\./)
      expect(page.ingredients.some((i) => i.section === "Sauce")).toBe(true)
    }))

  it.effect("accepte deux tailles de police dans le bloc ingrédients", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("deux-tailles-ingredients"), "recipe")
      expect(page.ingredients[0]?.raw).toBe("80g de lentilles corail")
      expect(page.ingredients.length).toBeGreaterThan(5)
    }))

  it.effect("accepte une ancre « Ingrédients » de taille atypique", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("ancre-taille-atypique"), "recipe")
      expect(page.ingredients.length).toBeGreaterThan(0)
    }))
})

describe("recettes à cheval sur deux pages", () => {
  it.effect("reconnaît une continuation qui répète le titre", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("continuation-avec-titre"), "continuation")
      expect(page.title).toBe("Couscous de légumes et saucisses de seitan")
      expect(page.instructions).toMatch(/^Mélanger avec le concentré de tomate/)
    }))

  it.effect("reconnaît une continuation sans titre", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("continuation-sans-titre"), "continuation")
      expect(page.title).toBeNull()
      expect(page.instructions.length).toBeGreaterThan(0)
    }))

  it.effect("ne confond pas une instruction citant « ingrédients » avec l'en-tête", () =>
    Effect.gen(function* () {
      // l2 p370 : « Mélanger les ingrédients du glaçage » ouvre un item de texte.
      const page = expectKind(yield* parse("instruction-citant-ingredients"), "continuation")
      expect(page.title).toBe("Cinnamon rolls vegan")
      expect(page.instructions).toMatch(/Mélanger les ingrédients du glaçage/)
    }))

  it.effect("reconnaît une continuation nue, sans titre ni portions", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("continuation-nue"), "continuation")
      expect(page.title).toBeNull()
      expect(page.instructions).toMatch(/^Préparer une plaque de cuisson/)
    }))
})

describe("champs absents", () => {
  it.effect("laisse servings à null quand la page ne porte pas de mention de portions", () =>
    Effect.gen(function* () {
      const page = expectKind(yield* parse("recette-sans-portions"), "recipe")
      expect(page.servings).toBeNull()
      expect(page.title).toBe("Mini cakes salés aux petits pois")
      expect(page.ingredients.length).toBeGreaterThan(0)
    }))
})
