import { normalizeLine } from "./normalize.ts"
import { formatQuantity, scale } from "./quantity.ts"
import { makeUnits, normalize, type Units } from "./units.ts"

/** Ce qu'un modèle a tiré d'une ligne d'ingrédient. */
export interface ParsedIngredient {
  readonly name: string
  readonly amount?: number
  readonly unit?: string
}

/** Ligne normalisée → ingrédients. Une ligne peut en porter plusieurs, ou aucun. */
export type Catalog = ReadonlyMap<string, ReadonlyArray<ParsedIngredient>>

/**
 * Variante → nom retenu. Les tranches étant traitées par des agents
 * indépendants, « purée de tomate » et « purée de tomates » coexistent. On les
 * unifie par une table explicite et non par une règle de pluriel, qui
 * confondrait « pâte » (à tarte) et « pâtes » (à cuire).
 */
export type Aliases = ReadonlyMap<string, string>

export interface SourceLine {
  readonly raw: string
  readonly section: string | null
}

export interface ExpandedIngredient {
  readonly name: string
  /** Telle qu'affichée sur la fiche : « 2 cuillères à soupe ». */
  readonly quantity: string | null
  /** Dans l'unité d'achat de l'ingrédient, pour la liste de courses. null, null = invariant. */
  readonly amount: number | null
  readonly unit: string | null
  readonly section: string | null
  readonly position: number
  readonly raw: string
}

export class UnknownLineError extends Error {
  constructor(readonly line: string) {
    super(`ligne absente du catalogue : ${JSON.stringify(line)}`)
    this.name = "UnknownLineError"
  }
}

/**
 * Éclate les lignes d'une recette en ingrédients, quantités ramenées à 2
 * portions. Une ligne perdue lève : mieux vaut une ingestion qui s'explique
 * qu'une recette amputée en silence.
 */
export const expandIngredients = (
  lines: ReadonlyArray<SourceLine>,
  servings: number | null,
  catalog: Catalog,
  aliases: Aliases = new Map(),
  units: Units = makeUnits(catalog, aliases)
): ReadonlyArray<ExpandedIngredient> => {
  const rows: Array<ExpandedIngredient> = []

  for (const line of lines) {
    const parsed = catalog.get(normalizeLine(line.raw))
    if (parsed === undefined) throw new UnknownLineError(line.raw)

    for (const ingredient of parsed) {
      const name = aliases.get(ingredient.name) ?? ingredient.name
      const normalized = normalize(name, ingredient, servings, units)
      rows.push({
        name,
        quantity: formatQuantity(
          ingredient.amount === undefined ? undefined : scale(ingredient.amount, servings),
          ingredient.unit
        ),
        amount: normalized._tag === "Quantified" ? normalized.amount : null,
        unit: normalized._tag === "Quantified" ? normalized.unit : null,
        section: line.section,
        position: rows.length,
        raw: line.raw,
      })
    }
  }

  return rows
}
