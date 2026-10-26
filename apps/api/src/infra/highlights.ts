import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

const HIGHLIGHTS = 3

/**
 * Les premiers ingrédients chiffrés de chaque recette, dans l'ordre imprimé :
 * les invariants (sel, huile, herbes) ne disent pas ce qu'il y a dedans. Un
 * ingrédient cité dans deux sections ne compte qu'une fois.
 */
export const highlightsOf = (sql: SqlClient.SqlClient, recipeIds: ReadonlyArray<number>) =>
  Effect.gen(function* () {
    const highlights = new Map<number, Array<string>>()
    if (recipeIds.length === 0) return highlights
    const rows = yield* sql<{ recipeId: number; name: string }>`
      SELECT "recipeId", name FROM (
        SELECT ri.recipe_id AS "recipeId", i.name,
               row_number() OVER (PARTITION BY ri.recipe_id ORDER BY min(ri.position)) AS rank
        FROM recipe_ingredients ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id IN ${sql.in(recipeIds)} AND ri.amount IS NOT NULL
        GROUP BY ri.recipe_id, i.name
      ) ranked
      WHERE rank <= ${HIGHLIGHTS}
      ORDER BY "recipeId", rank`
    for (const row of rows) {
      highlights.set(row.recipeId, [...(highlights.get(row.recipeId) ?? []), row.name])
    }
    return highlights
  })
