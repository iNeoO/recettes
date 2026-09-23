import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { Authentication, AuthGroup } from "./auth.ts"
import { ListsGroup } from "./list.ts"
import { ListQuery, Page, Recipe, RecipeNotFound, RecipeSummary } from "./recipe.ts"

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
  // Toutes les recettes exigent une session ; la route image, hors contrat,
  // fait la même vérification à la main (http/image-route.ts).
  .middleware(Authentication)

// /recipes/:id/image vit hors du contrat, dans http/image-route.ts : le
// Content-Type y est statique, or nos images sont tantôt JPEG tantôt PNG.

export class RecettesApi extends HttpApi.make("recettes")
  .add(AuthGroup)
  .add(RecipesGroup)
  .add(ListsGroup) {}
