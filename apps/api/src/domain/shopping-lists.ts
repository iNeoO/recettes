import type {
  ListItem,
  ListRecipe,
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
  readonly createdAt: Date
  readonly recipes: ReadonlyArray<ListRecipe>
  readonly items: ReadonlyArray<ListItem>
  readonly pantry: ReadonlyArray<PantryItem>
}

export type AddRecipeResult = "added" | "list-missing" | "recipe-missing"

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
    readonly create: (userId: number, name: string) => Effect.Effect<number, RepositoryError>
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
    readonly addRecipe: (
      userId: number,
      id: number,
      recipeId: number
    ) => Effect.Effect<AddRecipeResult, RepositoryError>
    /** Retire une occurrence, la dernière ajoutée. */
    readonly removeRecipe: (
      userId: number,
      id: number,
      recipeId: number
    ) => Effect.Effect<boolean, RepositoryError>
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
