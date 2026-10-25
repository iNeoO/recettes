import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { Authentication } from "./auth.ts"
import { RecipeNotFound } from "./recipe.ts"

/** draft : on choisit les plats ; ready : on fait les courses. */
export const ListStatus = Schema.Literal("draft", "ready")
export type ListStatus = typeof ListStatus.Type

/** Une liste vue de loin, pour l'onglet qui les énumère. */
export const ShoppingListSummary = Schema.Struct({
  id: Schema.Number,
  /** La date du jour à la création, en clair ; pas unique. */
  name: Schema.String,
  servings: Schema.Number,
  status: ListStatus,
  createdAt: Schema.Date,
  recipeCount: Schema.Number,
})
export type ShoppingListSummary = typeof ShoppingListSummary.Type

/** Un plat de la liste ; `count` > 1 quand il y figure plusieurs fois. */
export const ListRecipe = Schema.Struct({
  recipeId: Schema.Number,
  title: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  count: Schema.Number,
})
export type ListRecipe = typeof ListRecipe.Type

/** Un ingrédient chiffré, déjà mis à l'échelle du nombre de personnes. */
export const ListItem = Schema.Struct({
  ingredientId: Schema.Number,
  name: Schema.String,
  /** Brut : l'arrondi est une affaire d'affichage. */
  amount: Schema.Number,
  /** L'unité d'achat : "g", "ml", "pièce", "gousse", "tranche"… */
  unit: Schema.String,
  checked: Schema.Boolean,
})
export type ListItem = typeof ListItem.Type

/** Un ingrédient dont on veut, sans compter : huile, sel, herbes. */
export const PantryItem = Schema.Struct({
  ingredientId: Schema.Number,
  name: Schema.String,
  checked: Schema.Boolean,
})
export type PantryItem = typeof PantryItem.Type

export const ShoppingList = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  servings: Schema.Number,
  status: ListStatus,
  createdAt: Schema.Date,
  recipes: Schema.Array(ListRecipe),
  /** Triés par nom. */
  items: Schema.Array(ListItem),
  /** Triés par nom. */
  pantry: Schema.Array(PantryItem),
})
export type ShoppingList = typeof ShoppingList.Type

/** Inconnue, ou à quelqu'un d'autre : on ne fait pas la différence. */
export class ListNotFound extends Schema.TaggedError<ListNotFound>()(
  "ListNotFound",
  { id: Schema.Number },
  HttpApiSchema.annotations({ status: 404 })
) {}

/** Les plats d'une liste validée ne bougent plus : la rouvrir d'abord. */
export class ListNotDraft extends Schema.TaggedError<ListNotDraft>()(
  "ListNotDraft",
  { id: Schema.Number },
  HttpApiSchema.annotations({ status: 409 })
) {}

/** Une liste sans plat ne se valide pas. */
export class EmptyList extends Schema.TaggedError<EmptyList>()(
  "EmptyList",
  { id: Schema.Number },
  HttpApiSchema.annotations({ status: 409 })
) {}

export const MAX_SERVINGS = 50

export const ServingsUpdate = Schema.Struct({
  servings: Schema.Int.pipe(Schema.between(1, MAX_SERVINGS)),
})
export type ServingsUpdate = typeof ServingsUpdate.Type

export const MAX_MEALS = 21
export const DEFAULT_MEALS = 5

/** Le nombre de plats tirés au hasard ; 0 crée une liste vide, à remplir à la main. */
export const ListCreation = Schema.Struct({
  meals: Schema.Int.pipe(Schema.between(0, MAX_MEALS)),
})
export type ListCreation = typeof ListCreation.Type

export const RecipeRef = Schema.Struct({ recipeId: Schema.Number })

export const CheckUpdate = Schema.Struct({ checked: Schema.Boolean })

const listPath = Schema.Struct({ id: Schema.NumberFromString })

/** Toutes les mutations rendent la liste complète : le front n'a qu'une requête à rafraîchir. */
export const ListsGroup = HttpApiGroup.make("lists")
  .add(HttpApiEndpoint.get("list", "/lists").addSuccess(Schema.Array(ShoppingListSummary)))
  .add(
    HttpApiEndpoint.post("create", "/lists")
      .setPayload(ListCreation)
      .addSuccess(ShoppingList, { status: 201 })
  )
  .add(
    HttpApiEndpoint.get("byId", "/lists/:id")
      .setPath(listPath)
      .addSuccess(ShoppingList)
      .addError(ListNotFound)
  )
  .add(
    HttpApiEndpoint.patch("setServings", "/lists/:id")
      .setPath(listPath)
      .setPayload(ServingsUpdate)
      .addSuccess(ShoppingList)
      .addError(ListNotFound)
  )
  .add(
    HttpApiEndpoint.del("remove", "/lists/:id")
      .setPath(listPath)
      .addSuccess(HttpApiSchema.NoContent)
      .addError(ListNotFound)
  )
  .add(
    HttpApiEndpoint.post("finalize", "/lists/:id/finalize")
      .setPath(listPath)
      .addSuccess(ShoppingList)
      .addError(ListNotFound)
      .addError(EmptyList)
  )
  .add(
    HttpApiEndpoint.post("reopen", "/lists/:id/reopen")
      .setPath(listPath)
      .addSuccess(ShoppingList)
      .addError(ListNotFound)
  )
  .add(
    HttpApiEndpoint.post("addRecipe", "/lists/:id/recipes")
      .setPath(listPath)
      .setPayload(RecipeRef)
      .addSuccess(ShoppingList)
      .addError(ListNotFound)
      .addError(ListNotDraft)
      .addError(RecipeNotFound)
  )
  .add(
    HttpApiEndpoint.post("addRandomRecipe", "/lists/:id/recipes/random")
      .setPath(listPath)
      .addSuccess(ShoppingList)
      .addError(ListNotFound)
      .addError(ListNotDraft)
  )
  .add(
    HttpApiEndpoint.del("removeRecipe", "/lists/:id/recipes/:recipeId")
      .setPath(Schema.Struct({ id: Schema.NumberFromString, recipeId: Schema.NumberFromString }))
      .addSuccess(ShoppingList)
      .addError(ListNotFound)
      .addError(ListNotDraft)
  )
  .add(
    HttpApiEndpoint.post("replaceRecipe", "/lists/:id/recipes/:recipeId/replace")
      .setPath(Schema.Struct({ id: Schema.NumberFromString, recipeId: Schema.NumberFromString }))
      .addSuccess(ShoppingList)
      .addError(ListNotFound)
      .addError(ListNotDraft)
  )
  .add(
    HttpApiEndpoint.put("setChecked", "/lists/:id/checks/:ingredientId")
      .setPath(Schema.Struct({ id: Schema.NumberFromString, ingredientId: Schema.NumberFromString }))
      .setPayload(CheckUpdate)
      .addSuccess(HttpApiSchema.NoContent)
      .addError(ListNotFound)
  )
  .middleware(Authentication)
