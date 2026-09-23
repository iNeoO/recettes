import { countRecipes, DatabaseLive, type RecipeRow, upsertRecipes } from "@recettes/db"
import { Array as Arr, Chunk, Effect, Layer, Stream } from "effect"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { assemble, type Recipe } from "./assemble.ts"
import { expandIngredients, type Aliases, type Catalog } from "./ingredients/catalog.ts"
import { loadAliases, loadCatalog, loadUnits } from "./ingredients/load.ts"
import { BASE_SERVINGS } from "./ingredients/quantity.ts"
import { makeUnits, type Units } from "./ingredients/units.ts"
import { extractImages } from "./images.ts"
import { loadPages } from "./pdf.ts"
import { ParseError } from "./parser/types.ts"
import { Storage, type StorageError, StorageLive } from "./storage.ts"

const BOOKS = [1, 2] as const

const root = (file: string) => fileURLToPath(new URL(`../../../${file}`, import.meta.url))

/** Une recette et la clé Garage de sa photo, absente pour 8 recettes sur 887. */
type Photographed = readonly [Recipe, string | null]

const imageKey = (book: number, page: number, extension: string) =>
  `${book}/${String(page).padStart(4, "0")}.${extension}`

const ingestBook = (book: number, catalog: Catalog, aliases: Aliases, units: Units) =>
  Effect.gen(function* () {
    const storage = yield* Storage
    const pdf = root(`list${book}.pdf`)

    const { recipes, errors } = yield* loadPages(pdf, book).pipe(Effect.flatMap(assemble))
    yield* Effect.log(`livre ${book} : ${recipes.length} recettes analysées`)

    // Le dossier d'extraction est temporaire : Garage est la source de vérité.
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), `recettes-${book}-`))),
      (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true }))
    )

    const images = yield* extractImages(pdf, directory)
    const byPage = new Map(images.map((i) => [i.page, i]))

    const uploaded = yield* Stream.fromIterable(recipes).pipe(
      Stream.mapEffect(
        (recipe): Effect.Effect<Photographed, StorageError> => {
          // Une recette à cheval sur deux pages porte parfois sa photo sur la seconde.
          const image = recipe.pages.flatMap((p) => byPage.get(p) ?? []).at(0)
          if (image === undefined) return Effect.succeed([recipe, null] as const)
          const key = imageKey(book, image.page, image.extension)
          return storage
            .putIfAbsent(key, image.file, image.extension)
            .pipe(Effect.as([recipe, key] as const))
        },
        { concurrency: 8 }
      ),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray)
    )
    yield* Effect.log(`livre ${book} : ${uploaded.filter(([, k]) => k).length} images dans Garage`)

    // Une ligne absente du catalogue n'interrompt pas le livre : elle est
    // rapportée comme les autres échecs, et sa recette part sans ingrédients.
    const [expansionErrors, expanded] = yield* Effect.partition(
      uploaded,
      ([recipe, key]: Photographed) =>
        Effect.try({
          try: (): RecipeRow => ({
            book: recipe.book,
            page: recipe.page,
            title: recipe.title,
            category: recipe.category,
            // Les quantités sont ramenées à 2 : la colonne doit le dire.
            servings: recipe.servings === null ? null : BASE_SERVINGS,
            instructions: recipe.instructions,
            imageKey: key,
            ingredients: expandIngredients(recipe.ingredients, recipe.servings, catalog, aliases, units),
          }),
          catch: (cause) =>
            new ParseError({
              book: recipe.book,
              page: recipe.page,
              reason: cause instanceof Error ? cause.message : String(cause),
            }),
        })
    )

    // Mise à jour sur (book, page), jamais de suppression : les listes de
    // courses qui référencent une recette survivent à la réingestion.
    const stored = yield* upsertRecipes(expanded)
    const lines = expanded.reduce((n, r) => n + r.ingredients.length, 0)
    yield* Effect.log(`livre ${book} : ${stored.length} recettes écrites, ${lines} ingrédients`)

    return [...errors, ...expansionErrors]
  }).pipe(Effect.scoped)

const program = Effect.gen(function* () {
  const catalog = yield* loadCatalog()
  const aliases = yield* loadAliases()
  const rules = yield* loadUnits()
  const units = makeUnits(catalog, aliases, rules)
  yield* Effect.log(
    `catalogue : ${catalog.size} lignes, ${aliases.size} alias, ${rules.size} règles d'unité`
  )

  const errors = yield* Effect.forEach(BOOKS, (book) => ingestBook(book, catalog, aliases, units), {
    concurrency: 1,
  }).pipe(
    Effect.map(Arr.flatten)
  )

  yield* Effect.log(`terminé : ${yield* countRecipes} recettes en base`)

  if (errors.length > 0) {
    yield* Effect.logError(`${errors.length} page(s) non analysée(s) :`)
    for (const error of errors) yield* Effect.logError(`  ${error.message}`)
    return yield* Effect.fail(new Error(`${errors.length} page(s) en échec`))
  }
})

Effect.runPromiseExit(
  program.pipe(Effect.provide(Layer.mergeAll(DatabaseLive, StorageLive)))
).then((exit) => {
  process.exitCode = exit._tag === "Success" ? 0 : 1
})
