import { SqlClient } from "@effect/sql"
import { PgDrizzle, schema } from "@recettes/db"
import type { ListItem, ListRecipe, PantryItem, ShoppingListSummary } from "@recettes/contract"
import { and, count, desc, eq, isNull, min, notInArray, or, sql } from "drizzle-orm"
import { Effect, Layer, Option } from "effect"
import { RepositoryError } from "../domain/repository.ts"
import { ShoppingListRepository, type StoredList } from "../domain/shopping-lists.ts"

const asRepositoryError = <A, R>(effect: Effect.Effect<A, unknown, R>) =>
  Effect.mapError(effect, (cause) => new RepositoryError({ cause }))

export const ShoppingListRepositoryLive = Layer.effect(
  ShoppingListRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle
    const raw = yield* SqlClient.SqlClient

    /** La liste, si elle est à cet utilisateur. */
    const owned = (userId: number, id: number) =>
      db
        .select()
        .from(schema.shoppingLists)
        .where(and(eq(schema.shoppingLists.id, id), eq(schema.shoppingLists.userId, userId)))
        .limit(1)
        .pipe(Effect.map((rows) => Option.fromNullable(rows[0])))

    const recipesOf = (id: number): Effect.Effect<ReadonlyArray<ListRecipe>, unknown> =>
      db
        .select({
          recipeId: schema.shoppingListRecipes.recipeId,
          title: schema.recipes.title,
          imageKey: schema.recipes.imageKey,
          count: count(),
          first: min(schema.shoppingListRecipes.position),
        })
        .from(schema.shoppingListRecipes)
        .innerJoin(schema.recipes, eq(schema.recipes.id, schema.shoppingListRecipes.recipeId))
        .where(eq(schema.shoppingListRecipes.listId, id))
        .groupBy(schema.shoppingListRecipes.recipeId, schema.recipes.title, schema.recipes.imageKey)
        .orderBy(min(schema.shoppingListRecipes.position))
        .pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              recipeId: row.recipeId,
              title: row.title,
              imageUrl: row.imageKey === null ? null : `/recipes/${row.recipeId}/image`,
              count: row.count,
            }))
          )
        )

    // Une ligne par occurrence de recette : la jointure compte naturellement
    // double une recette ajoutée deux fois. Les sommes valent pour 2 portions.
    const itemsOf = (id: number) =>
      raw<{ ingredientId: number; name: string; unit: string; amount: number; checked: boolean }>`
        SELECT ri.ingredient_id AS "ingredientId", i.name, ri.unit,
               sum(ri.amount)::float8 AS amount,
               (c.list_id IS NOT NULL) AS checked
        FROM shopping_list_recipes slr
        JOIN recipe_ingredients ri ON ri.recipe_id = slr.recipe_id
        JOIN ingredients i ON i.id = ri.ingredient_id
        LEFT JOIN shopping_list_checks c
          ON c.list_id = slr.list_id AND c.ingredient_id = ri.ingredient_id
        WHERE slr.list_id = ${id} AND ri.amount IS NOT NULL
        GROUP BY ri.ingredient_id, i.name, ri.unit, c.list_id
        ORDER BY i.name`.pipe(Effect.map((rows): ReadonlyArray<ListItem> => rows))

    // Au placard : les ingrédients dont aucune ligne de la liste n'est chiffrée.
    const pantryOf = (id: number) =>
      raw<{ ingredientId: number; name: string; checked: boolean }>`
        SELECT DISTINCT ri.ingredient_id AS "ingredientId", i.name,
               (c.list_id IS NOT NULL) AS checked
        FROM shopping_list_recipes slr
        JOIN recipe_ingredients ri ON ri.recipe_id = slr.recipe_id
        JOIN ingredients i ON i.id = ri.ingredient_id
        LEFT JOIN shopping_list_checks c
          ON c.list_id = slr.list_id AND c.ingredient_id = ri.ingredient_id
        WHERE slr.list_id = ${id}
          AND ri.amount IS NULL
          AND ri.ingredient_id NOT IN (
            SELECT ri2.ingredient_id
            FROM shopping_list_recipes s2
            JOIN recipe_ingredients ri2 ON ri2.recipe_id = s2.recipe_id
            WHERE s2.list_id = ${id} AND ri2.amount IS NOT NULL)
        ORDER BY i.name`.pipe(Effect.map((rows): ReadonlyArray<PantryItem> => rows))

    return {
      listFor: (userId) =>
        db
          .select({
            id: schema.shoppingLists.id,
            name: schema.shoppingLists.name,
            servings: schema.shoppingLists.servings,
            createdAt: schema.shoppingLists.createdAt,
            // Identifiants écrits en clair : dans une liste de colonnes, drizzle
            // dépouille les siens de leur table et « id » deviendrait ambigu.
            recipeCount: sql<number>`(
              SELECT count(*)::int FROM shopping_list_recipes slr
              WHERE slr.list_id = shopping_lists.id)`,
          })
          .from(schema.shoppingLists)
          .where(eq(schema.shoppingLists.userId, userId))
          .orderBy(desc(schema.shoppingLists.createdAt), desc(schema.shoppingLists.id))
          .pipe(
            Effect.map((rows): ReadonlyArray<ShoppingListSummary> => rows),
            asRepositoryError
          ),

      mealPool: (excludedCategories) =>
        db
          .select({ id: schema.recipes.id })
          .from(schema.recipes)
          .where(
            or(
              isNull(schema.recipes.category),
              notInArray(schema.recipes.category, [...excludedCategories])
            )
          )
          .pipe(
            Effect.map((rows) => rows.map((row) => row.id)),
            asRepositoryError
          ),

      create: (userId, name, recipeIds) =>
        Effect.gen(function* () {
          const [list] = yield* db
            .insert(schema.shoppingLists)
            .values({ userId, name })
            .returning({ id: schema.shoppingLists.id })
          if (list === undefined) return yield* Effect.fail("insertion sans retour")
          if (recipeIds.length > 0) {
            yield* db.insert(schema.shoppingListRecipes).values(
              recipeIds.map((recipeId, index) => ({ listId: list.id, recipeId, position: index + 1 }))
            )
          }
          return list.id
        }).pipe(raw.withTransaction, asRepositoryError),

      find: (userId, id) =>
        Effect.gen(function* () {
          const list = yield* owned(userId, id)
          if (Option.isNone(list)) return Option.none()
          const [recipes, items, pantry] = yield* Effect.all(
            [recipesOf(id), itemsOf(id), pantryOf(id)],
            { concurrency: 1 }
          )
          const stored: StoredList = {
            id: list.value.id,
            name: list.value.name,
            servings: list.value.servings,
            createdAt: list.value.createdAt,
            recipes,
            items,
            pantry,
          }
          return Option.some(stored)
        }).pipe(asRepositoryError),

      setServings: (userId, id, servings) =>
        db
          .update(schema.shoppingLists)
          .set({ servings })
          .where(and(eq(schema.shoppingLists.id, id), eq(schema.shoppingLists.userId, userId)))
          .returning({ id: schema.shoppingLists.id })
          .pipe(
            Effect.map((rows) => rows.length > 0),
            asRepositoryError
          ),

      remove: (userId, id) =>
        db
          .delete(schema.shoppingLists)
          .where(and(eq(schema.shoppingLists.id, id), eq(schema.shoppingLists.userId, userId)))
          .returning({ id: schema.shoppingLists.id })
          .pipe(
            Effect.map((rows) => rows.length > 0),
            asRepositoryError
          ),

      addRecipe: (userId, id, recipeId) =>
        Effect.gen(function* () {
          if (Option.isNone(yield* owned(userId, id))) return "list-missing" as const
          const recipe = yield* db
            .select({ id: schema.recipes.id })
            .from(schema.recipes)
            .where(eq(schema.recipes.id, recipeId))
            .limit(1)
          if (recipe.length === 0) return "recipe-missing" as const
          yield* db.insert(schema.shoppingListRecipes).values({
            listId: id,
            recipeId,
            position: sql`(
              SELECT coalesce(max(${schema.shoppingListRecipes.position}), 0) + 1
              FROM ${schema.shoppingListRecipes}
              WHERE ${schema.shoppingListRecipes.listId} = ${id})`,
          })
          return "added" as const
        }).pipe(asRepositoryError),

      removeRecipe: (userId, id, recipeId) =>
        Effect.gen(function* () {
          if (Option.isNone(yield* owned(userId, id))) return false
          yield* raw`
            DELETE FROM shopping_list_recipes
            WHERE id = (
              SELECT id FROM shopping_list_recipes
              WHERE list_id = ${id} AND recipe_id = ${recipeId}
              ORDER BY position DESC LIMIT 1)`
          return true
        }).pipe(asRepositoryError),

      replaceRecipe: (userId, id, recipeId, replacementId) =>
        Effect.gen(function* () {
          if (Option.isNone(yield* owned(userId, id))) return false
          yield* raw`
            UPDATE shopping_list_recipes SET recipe_id = ${replacementId}
            WHERE id = (
              SELECT id FROM shopping_list_recipes
              WHERE list_id = ${id} AND recipe_id = ${recipeId}
              ORDER BY position DESC LIMIT 1)`
          return true
        }).pipe(asRepositoryError),

      setChecked: (userId, id, ingredientId, checked) =>
        Effect.gen(function* () {
          if (Option.isNone(yield* owned(userId, id))) return false
          if (checked) {
            yield* db
              .insert(schema.shoppingListChecks)
              .values({ listId: id, ingredientId })
              .onConflictDoNothing()
          } else {
            yield* db
              .delete(schema.shoppingListChecks)
              .where(
                and(
                  eq(schema.shoppingListChecks.listId, id),
                  eq(schema.shoppingListChecks.ingredientId, ingredientId)
                )
              )
          }
          return true
        }).pipe(asRepositoryError),
    }
  })
)
