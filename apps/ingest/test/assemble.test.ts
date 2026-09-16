import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { readFileSync } from "node:fs"
import { assemble } from "../src/assemble.ts"
import type { PageInput } from "../src/parser/types.ts"

const fixture = (name: string): PageInput =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"))

describe("assemblage d'un livre", () => {
  it.effect("rattache une continuation à la recette précédente", () =>
    Effect.gen(function* () {
      const { recipes, errors } = yield* assemble([
        fixture("separateur-categorie"),
        { ...fixture("canonique-une-colonne"), page: 2 },
        { ...fixture("continuation-sans-titre"), book: 1, page: 3 },
      ])

      expect(errors).toEqual([])
      expect(recipes).toHaveLength(1)
      const [recipe] = recipes
      expect(recipe!.category).toBe("Salades & bowls")
      expect(recipe!.page).toBe(2)
      // La page 3 compte comme occupée : c'est là que peut se trouver la photo.
      expect(recipe!.pages).toEqual([2, 3])
      // Les instructions de la continuation sont ajoutées après celles de la recette.
      expect(recipe!.instructions).toMatch(/^Couper les tomates en tranches/)
      expect(recipe!.instructions).toMatch(/Laver et essorer la salade/)
    }))

  it.effect("signale une continuation orpheline au lieu de la perdre", () =>
    Effect.gen(function* () {
      const { recipes, errors } = yield* assemble([
        { ...fixture("continuation-sans-titre"), book: 1, page: 1 },
      ])
      expect(recipes).toEqual([])
      expect(errors.map((e) => e.message)).toEqual([
        "livre 1 p1: continuation sans recette précédente",
      ])
    }))
})
