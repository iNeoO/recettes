import { Data, Effect } from "effect"
import { execFile } from "node:child_process"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)

export class ImageError extends Data.TaggedError("ImageError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export interface PageImage {
  readonly page: number
  readonly file: string
  readonly extension: string
}

/** Ligne du tableau `pdfimages -list` : page, index global, type, largeur, hauteur. */
const LISTING = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)/

/** Fichier écrit par `pdfimages -p` : prefixe-<page>-<index>.<ext> */
const FILENAME = /-(\d+)-(\d+)\.([a-z]+)$/

/**
 * Extrait une image par page dans `directory`, la plus grande quand la page en
 * porte plusieurs — ce qui écarte au passage les autocollants décoratifs.
 *
 * `-all` conserve le format d'origine : un JPEG reste un JPEG, sans réencodage.
 */
export const extractImages = (
  pdf: string,
  directory: string
): Effect.Effect<ReadonlyArray<PageImage>, ImageError> =>
  Effect.tryPromise({
    try: async () => {
      const { stdout } = await run("pdfimages", ["-list", pdf], { maxBuffer: 64 << 20 })

      const largest = new Map<number, { index: number; pixels: number }>()
      for (const line of stdout.split("\n")) {
        const match = LISTING.exec(line)
        if (match === null || match[3] !== "image") continue
        const [page, index, pixels] = [+match[1]!, +match[2]!, +match[4]! * +match[5]!]
        if ((largest.get(page)?.pixels ?? -1) < pixels) largest.set(page, { index, pixels })
      }

      await run("pdfimages", ["-all", "-p", pdf, join(directory, "img")], {
        maxBuffer: 64 << 20,
      })

      const files = new Map<string, { file: string; extension: string }>()
      for (const file of await readdir(directory)) {
        const match = FILENAME.exec(file)
        if (match !== null) {
          files.set(`${+match[1]!}-${+match[2]!}`, {
            file: join(directory, file),
            extension: match[3]!,
          })
        }
      }

      return [...largest].flatMap(([page, { index }]) => {
        const found = files.get(`${page}-${index}`)
        return found === undefined ? [] : [{ page, ...found }]
      })
    },
    catch: (cause) => new ImageError({ path: pdf, cause }),
  })
