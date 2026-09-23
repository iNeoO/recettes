import { describe, expect, it } from "vitest"
import { validateSearch } from "../src/search.ts"

describe("filtres lus dans l'URL", () => {
  it("accepte des filtres valides et convertit les nombres", () => {
    expect(validateSearch({ search: "creme", book: "2", offset: "20" })).toEqual({
      search: "creme",
      book: 2,
      offset: 20,
    })
  })

  it("écarte un limit hors bornes", () => {
    expect(validateSearch({ limit: 99999 }).limit).toBeUndefined()
    expect(validateSearch({ limit: 100 }).limit).toBe(100)
  })

  it("écarte un offset non numérique ou négatif", () => {
    expect(validateSearch({ offset: "abc" }).offset).toBeUndefined()
    expect(validateSearch({ offset: -1 }).offset).toBeUndefined()
  })

  it("écarte un livre inexistant", () => {
    expect(validateSearch({ book: 3 }).book).toBeUndefined()
  })

  it("garde les champs valides malgré un champ invalide", () => {
    // Une seule valeur aberrante ne doit pas vider toute la recherche.
    expect(validateSearch({ search: "creme", limit: 99999 })).toMatchObject({
      search: "creme",
      limit: undefined,
    })
  })

  it("rend toutes les clés, le routeur fusionnant le résultat dans le brut", () => {
    expect(Object.keys(validateSearch({})).sort()).toEqual([
      "book",
      "category",
      "limit",
      "list",
      "offset",
      "redirect",
      "search",
    ])
  })

  it("n'accepte comme redirect qu'un chemin interne", () => {
    expect(validateSearch({ redirect: "/recipes/7?x=1" }).redirect).toBe("/recipes/7?x=1")
    expect(validateSearch({ redirect: "https://evil.example/" }).redirect).toBeUndefined()
    // Protocol-relative : le navigateur en ferait un changement d'hôte.
    expect(validateSearch({ redirect: "//evil.example/" }).redirect).toBeUndefined()
    expect(validateSearch({ redirect: "/\\evil.example/" }).redirect).toBeUndefined()
    expect(validateSearch({ redirect: "recipes" }).redirect).toBeUndefined()
    expect(validateSearch({ redirect: 42 }).redirect).toBeUndefined()
  })

  it("n'accepte comme liste en cours qu'un identifiant entier positif", () => {
    expect(validateSearch({ list: "3" }).list).toBe(3)
    expect(validateSearch({ list: 0 }).list).toBeUndefined()
    expect(validateSearch({ list: "abc" }).list).toBeUndefined()
    expect(validateSearch({ list: 1.5 }).list).toBeUndefined()
  })
})
