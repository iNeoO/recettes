import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { ListQuery, Page, Recipe, RecipeSummary } from "./recipe.ts"

export class RecipeNotFound extends Schema.TaggedError<RecipeNotFound>()(
  "RecipeNotFound",
  { id: Schema.Number },
  HttpApiSchema.annotations({ status: 404 })
) {}

const RecipesGroup = HttpApiGroup.make("recipes")
  .add(
    HttpApiEndpoint.get("list", "/recipes")
      .setUrlParams(ListQuery)
      .addSuccess(Page(RecipeSummary))
  )
  .add(
    HttpApiEndpoint.get("byId", "/recipes/:id")
      .setPath(Schema.Struct({ id: Schema.NumberFromString }))
      .addSuccess(Recipe)
      .addError(RecipeNotFound)
  )

// /recipes/:id/image vit hors du contrat, dans http/image-route.ts : le
// Content-Type y est statique, or nos images sont tantôt JPEG tantôt PNG.

export class RecettesApi extends HttpApi.make("recettes").add(RecipesGroup) {}
