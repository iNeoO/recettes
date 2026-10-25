import { HttpApiBuilder } from "@effect/platform"
import {
  CurrentUser,
  EmptyList,
  ListNotDraft,
  ListNotFound,
  RecettesApi,
  RecipeNotFound,
} from "@recettes/contract"
import { Clock, Effect, Option } from "effect"
import { drawMeals, NOT_MEALS } from "../domain/meals.ts"
import {
  type DishEdit,
  listName,
  scaled,
  ShoppingListRepository,
} from "../domain/shopping-lists.ts"
import { orInternalError } from "./errors.ts"

export const ListsLive = HttpApiBuilder.group(RecettesApi, "lists", (handlers) =>
  Effect.gen(function* () {
    const lists = yield* ShoppingListRepository

    /** La liste complète, mise à l'échelle, ou 404. */
    const load = (userId: number, id: number) =>
      orInternalError(lists.find(userId, id)).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new ListNotFound({ id })),
            onSome: (list) => Effect.succeed(scaled(list)),
          })
        )
      )

    const mealPool = orInternalError(lists.mealPool(NOT_MEALS))

    /** Un booléen « trouvée » devient 404 quand il est faux. */
    const orNotFound = (id: number) => (found: boolean) =>
      found ? Effect.void : Effect.fail(new ListNotFound({ id }))

    const orNotDraft =
      (id: number) =>
      (result: DishEdit): Effect.Effect<void, ListNotFound | ListNotDraft> =>
        result === "list-missing"
          ? Effect.fail(new ListNotFound({ id }))
          : result === "not-draft"
            ? Effect.fail(new ListNotDraft({ id }))
            : Effect.void

    return handlers
      .handle("list", () =>
        CurrentUser.pipe(Effect.flatMap((user) => orInternalError(lists.listFor(user.id))))
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const now = yield* Clock.currentTimeMillis
          const recipeIds = yield* drawMeals(yield* mealPool, payload.meals)
          const id = yield* orInternalError(lists.create(user.id, listName(now), recipeIds))
          // Introuvable juste après l'insertion : ce n'est plus une erreur du contrat.
          return yield* load(user.id, id).pipe(Effect.catchTag("ListNotFound", Effect.die))
        })
      )
      .handle("byId", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          return yield* load(user.id, path.id)
        })
      )
      .handle("setServings", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* orInternalError(lists.setServings(user.id, path.id, payload.servings)).pipe(
            Effect.flatMap(orNotFound(path.id))
          )
          return yield* load(user.id, path.id)
        })
      )
      .handle("remove", ({ path }) =>
        CurrentUser.pipe(
          Effect.flatMap((user) => orInternalError(lists.remove(user.id, path.id))),
          Effect.flatMap(orNotFound(path.id))
        )
      )
      .handle("finalize", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const result = yield* orInternalError(lists.finalize(user.id, path.id))
          if (result === "list-missing") return yield* new ListNotFound({ id: path.id })
          if (result === "empty") return yield* new EmptyList({ id: path.id })
          return yield* load(user.id, path.id)
        })
      )
      .handle("reopen", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* orInternalError(lists.reopen(user.id, path.id)).pipe(
            Effect.flatMap(orNotFound(path.id))
          )
          return yield* load(user.id, path.id)
        })
      )
      .handle("addRecipe", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const result = yield* orInternalError(lists.addRecipe(user.id, path.id, payload.recipeId))
          if (result === "recipe-missing") return yield* new RecipeNotFound({ id: payload.recipeId })
          yield* orNotDraft(path.id)(result)
          return yield* load(user.id, path.id)
        })
      )
      .handle("removeRecipe", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* orInternalError(lists.removeRecipe(user.id, path.id, path.recipeId)).pipe(
            Effect.flatMap(orNotDraft(path.id))
          )
          return yield* load(user.id, path.id)
        })
      )
      .handle("replaceRecipe", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const result = yield* orInternalError(
            lists.replaceRecipe(user.id, path.id, path.recipeId, payload.recipeId)
          )
          if (result === "recipe-missing") return yield* new RecipeNotFound({ id: payload.recipeId })
          yield* orNotDraft(path.id)(result)
          return yield* load(user.id, path.id)
        })
      )
      .handle("setChecked", ({ path, payload }) =>
        CurrentUser.pipe(
          Effect.flatMap((user) =>
            orInternalError(lists.setChecked(user.id, path.id, path.ingredientId, payload.checked))
          ),
          Effect.flatMap(orNotFound(path.id))
        )
      )
  })
)
