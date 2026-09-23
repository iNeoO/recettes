import { HttpApiBuilder } from "@effect/platform"
import { CurrentUser, ListNotFound, RecettesApi, RecipeNotFound } from "@recettes/contract"
import { Clock, Effect, Option } from "effect"
import { listName, scaled, ShoppingListRepository } from "../domain/shopping-lists.ts"
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

    /** Un booléen « trouvée » devient 404 quand il est faux. */
    const orNotFound = (id: number) => (found: boolean) =>
      found ? Effect.void : Effect.fail(new ListNotFound({ id }))

    return handlers
      .handle("list", () =>
        CurrentUser.pipe(Effect.flatMap((user) => orInternalError(lists.listFor(user.id))))
      )
      .handle("create", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const now = yield* Clock.currentTimeMillis
          const id = yield* orInternalError(lists.create(user.id, listName(now)))
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
      .handle("addRecipe", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const result = yield* orInternalError(lists.addRecipe(user.id, path.id, payload.recipeId))
          if (result === "list-missing") return yield* new ListNotFound({ id: path.id })
          if (result === "recipe-missing") return yield* new RecipeNotFound({ id: payload.recipeId })
          return yield* load(user.id, path.id)
        })
      )
      .handle("removeRecipe", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          yield* orInternalError(lists.removeRecipe(user.id, path.id, path.recipeId)).pipe(
            Effect.flatMap(orNotFound(path.id))
          )
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
