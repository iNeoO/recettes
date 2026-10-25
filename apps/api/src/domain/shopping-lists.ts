import type {
  ListItem,
  ListRecipe,
  ListStatus,
  PantryItem,
  ShoppingList,
  ShoppingListSummary,
} from "@recettes/contract"
import { Context, type Effect, type Option } from "effect"
import type { RepositoryError } from "./repository.ts"

/** Les quantités sont ramenées à ce nombre de portions à l'ingestion. */
export const BASE_SERVINGS = 2

/** Une liste telle qu'elle est stockée : les sommes valent pour 2 portions. */
export interface StoredList {
  readonly id: number
  readonly name: string
  readonly servings: number
  readonly status: ListStatus
  readonly createdAt: Date
  readonly recipes: ReadonlyArray<ListRecipe>
  readonly items: ReadonlyArray<ListItem>
  readonly pantry: ReadonlyArray<PantryItem>
}

/** Les plats ne bougent que sur une liste en draft. */
export type DishEdit = "done" | "list-missing" | "not-draft"
export type DishAdd = DishEdit | "recipe-missing"
export type Finalize = "done" | "list-missing" | "empty"

/**
 * Le port. Toute lecture ou écriture passe par (userId, id) : la liste d'un
 * autre utilisateur est introuvable, jamais interdite — on ne confirme pas
 * qu'elle existe. Les booléens disent si la liste a été trouvée.
 */
export class ShoppingListRepository extends Context.Tag("ShoppingListRepository")<
  ShoppingListRepository,
  {
    readonly listFor: (
      userId: number
    ) => Effect.Effect<ReadonlyArray<ShoppingListSummary>, RepositoryError>
    /** Les recettes tirables : toutes, sauf celles des catégories exclues. */
    readonly mealPool: (
      excludedCategories: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<number>, RepositoryError>
    /** La liste et ses plats, dans l'ordre donné, en une transaction. */
    readonly create: (
      userId: number,
      name: string,
      recipeIds: ReadonlyArray<number>
    ) => Effect.Effect<number, RepositoryError>
    readonly find: (
      userId: number,
      id: number
    ) => Effect.Effect<Option.Option<StoredList>, RepositoryError>
    readonly setServings: (
      userId: number,
      id: number,
      servings: number
    ) => Effect.Effect<boolean, RepositoryError>
    readonly remove: (userId: number, id: number) => Effect.Effect<boolean, RepositoryError>
    /** Passe en ready ; refusé tant que la liste n'a aucun plat. */
    readonly finalize: (userId: number, id: number) => Effect.Effect<Finalize, RepositoryError>
    readonly reopen: (userId: number, id: number) => Effect.Effect<boolean, RepositoryError>
    readonly addRecipe: (
      userId: number,
      id: number,
      recipeId: number
    ) => Effect.Effect<DishAdd, RepositoryError>
    /** Retire une occurrence, la dernière ajoutée. */
    readonly removeRecipe: (
      userId: number,
      id: number,
      recipeId: number
    ) => Effect.Effect<DishEdit, RepositoryError>
    /** Remplace une occurrence, la dernière ajoutée, en gardant sa place. */
    readonly replaceRecipe: (
      userId: number,
      id: number,
      recipeId: number,
      replacementId: number
    ) => Effect.Effect<DishEdit, RepositoryError>
    readonly setChecked: (
      userId: number,
      id: number,
      ingredientId: number,
      checked: boolean
    ) => Effect.Effect<boolean, RepositoryError>
  }
>() {}

/** La mise à l'échelle est une règle du domaine : le SQL somme, ici on multiplie. */
export const scaled = (list: StoredList): ShoppingList => ({
  ...list,
  items: list.items.map((item) => ({
    ...item,
    amount: (item.amount * list.servings) / BASE_SERVINGS,
  })),
})

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

/** Le nom d'une liste : la date du jour, lue sur l'horloge d'Effect. */
export const listName = (millis: number): string => dateFormat.format(new Date(millis))
