import { Data, Effect, Schema } from "effect"
import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { Aliases, Catalog, ParsedIngredient } from "./catalog.ts"
import { normalizeLine } from "./normalize.ts"

export class CatalogError extends Data.TaggedError("CatalogError")<{
  readonly file: string
  readonly reason: string
}> {}

/** Ce que les agents écrivent : une ligne du PDF → ses ingrédients. */
const Entry = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  amount: Schema.optional(Schema.Number),
  unit: Schema.optional(Schema.NonEmptyTrimmedString),
})

const File = Schema.Record({ key: Schema.String, value: Schema.Array(Entry) })

export const CATALOG_DIR = fileURLToPath(new URL("../../data/parsed/", import.meta.url))
export const ALIASES_FILE = fileURLToPath(new URL("../../data/aliases.json", import.meta.url))

/**
 * Table des variantes à unifier. Facultative : sans elle, chaque nom reste tel
 * que l'agent l'a écrit. Voir `scripts/suggest-aliases.ts` pour la construire.
 */
export const loadAliases = (file = ALIASES_FILE): Effect.Effect<Aliases, CatalogError> =>
  Effect.tryPromise({
    try: () => readFile(file, "utf8"),
    catch: () => null,
  }).pipe(
    Effect.flatMap((content) =>
      Schema.decodeUnknown(Schema.Record({ key: Schema.String, value: Schema.String }))(
        JSON.parse(content)
      ).pipe(
        Effect.mapError((error) => new CatalogError({ file, reason: String(error) })),
        Effect.map((record) => new Map(Object.entries(record)) as Aliases)
      )
    ),
    // Absent, c'est le cas normal tant qu'aucune variante n'a été arbitrée.
    Effect.catchAll((error) =>
      error === null ? Effect.succeed(new Map() as Aliases) : Effect.fail(error)
    )
  )

/**
 * Fusionne les tranches produites par les agents. Les clés sont renormalisées
 * ici : un agent qui aurait redressé une apostrophe ne casse pas la jointure.
 */
export const loadCatalog = (
  directory = CATALOG_DIR
): Effect.Effect<Catalog, CatalogError> =>
  Effect.gen(function* () {
    const files = yield* Effect.tryPromise({
      try: () => readdir(directory),
      catch: () => new CatalogError({ file: directory, reason: "dossier illisible" }),
    }).pipe(Effect.map((all) => all.filter((f) => f.endsWith(".json")).sort()))

    if (files.length === 0) {
      return yield* new CatalogError({ file: directory, reason: "aucune tranche" })
    }

    const catalog = new Map<string, ReadonlyArray<ParsedIngredient>>()
    for (const file of files) {
      const content = yield* Effect.tryPromise({
        try: () => readFile(`${directory}${file}`, "utf8"),
        catch: () => new CatalogError({ file, reason: "lecture impossible" }),
      })
      const decoded = yield* Schema.decodeUnknown(File)(JSON.parse(content)).pipe(
        Effect.mapError((error) => new CatalogError({ file, reason: String(error) }))
      )
      for (const [line, entries] of Object.entries(decoded)) {
        catalog.set(normalizeLine(line), entries)
      }
    }

    return catalog
  })
