import { relations, sql } from "drizzle-orm"
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

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
    /**
     * La même quantité dans l'unité d'achat de l'ingrédient, pour la liste de
     * courses (voir apps/ingest/data/units.json). Les deux à null : la ligne
     * est invariante — on en veut, peu importe combien.
     */
    amount: doublePrecision("amount"),
    unit: text("unit"),
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

/**
 * Les comptes. Aucune table d'authentification ne référence recipes : le
 * TRUNCATE ... CASCADE de la réingestion ne les touche jamais.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    /** Chaîne PHC produite par argon2id, jamais le mot de passe. */
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // L'adresse est comparée sans tenir compte de la casse.
    uniqueIndex("users_email_lower_key").on(sql`lower(${table.email})`),
  ]
)

/**
 * Une ligne par connexion. Seul le SHA-256 du jeton est stocké : un dump de
 * cette table ne permet pas de se connecter.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Fixe : 7 jours après la connexion, sans glissement. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
)

/** Une liste de courses : des plats, un nombre de personnes, des cases cochées. */
export const shoppingLists = pgTable(
  "shopping_lists",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** La date du jour à la création ; les doublons sont acceptés. */
    name: text("name").notNull(),
    /** Un seul nombre pour toute la liste ; les recettes sont ramenées à 2. */
    servings: integer("servings").notNull().default(2),
    /** draft : on choisit les plats ; ready : on fait les courses. */
    status: text("status", { enum: ["draft", "ready"] }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shopping_lists_user_id_idx").on(table.userId),
    check("shopping_lists_status_check", sql`${table.status} IN ('draft', 'ready')`),
  ]
)

/**
 * Une ligne par occurrence : la même recette peut figurer deux fois, ses
 * quantités comptent double. RESTRICT côté recette : une réingestion qui
 * voudrait supprimer une recette référencée doit échouer bruyamment.
 */
export const shoppingListRecipes = pgTable(
  "shopping_list_recipes",
  {
    id: serial("id").primaryKey(),
    listId: integer("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "restrict" }),
    /** Ordre d'ajout. */
    position: integer("position").notNull(),
  },
  (table) => [index("shopping_list_recipes_list_id_idx").on(table.listId)]
)

/** Les ingrédients cochés d'une liste ; la ligne existe = coché. */
export const shoppingListChecks = pgTable(
  "shopping_list_checks",
  {
    listId: integer("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.listId, table.ingredientId] })]
)
