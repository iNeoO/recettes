import { relations } from "drizzle-orm"
import { index, integer, pgTable, serial, smallint, text, uniqueIndex } from "drizzle-orm/pg-core"

export const recipes = pgTable(
  "recipes",
  {
    id: serial("id").primaryKey(),
    /** 1 ou 2 : le livre d'origine. */
    book: smallint("book").notNull(),
    page: integer("page").notNull(),
    title: text("title").notNull(),
    /** Issue de la page séparatrice qui précède, ex. "Pâtes & riz". */
    category: text("category"),
    /** 47 recettes sur 887 n'affichent pas de nombre de portions. */
    servings: integer("servings"),
    /** Étapes séparées par une ligne vide. */
    instructions: text("instructions").notNull(),
    /** Clé de l'objet dans Garage, ex. "1/0042.jpg". */
    imageKey: text("image_key"),
  },
  (table) => [
    // Deux recettes sur la même page trahiraient un découpage fautif.
    uniqueIndex("recipes_book_page_key").on(table.book, table.page),
  ]
)

/** Les ingrédients canoniques, dédupliqués sur tout le corpus. */
export const ingredients = pgTable("ingredients", {
  id: serial("id").primaryKey(),
  /** Minuscules, singulier, sans quantité : "huile d'olive", "tofu ferme". */
  name: text("name").notNull().unique(),
})

/** Ce qu'une recette emploie, et en quelle quantité pour 2 portions. */
export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: serial("id").primaryKey(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    /** Rang dans la liste, tel qu'imprimé. */
    position: integer("position").notNull(),
    /** Sous-titre du bloc, ex. "Pour la vinaigrette". */
    section: text("section"),
    /** Ramenée à 2 portions. "200g", "1/2", "2 cuillères à soupe", "pincée". */
    quantity: text("quantity"),
    /** La ligne du PDF dont cette entrée est issue : aucune perte. */
    raw: text("raw").notNull(),
  },
  (table) => [
    index("recipe_ingredients_recipe_id_idx").on(table.recipeId),
    index("recipe_ingredients_ingredient_id_idx").on(table.ingredientId),
  ]
)

export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(recipeIngredients),
}))

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id],
  }),
  ingredient: one(ingredients, {
    fields: [recipeIngredients.ingredientId],
    references: [ingredients.id],
  }),
}))
