import { Data, Effect } from "effect"
import { readFile } from "node:fs/promises"
import { getDocumentProxy } from "unpdf"
import type { PageInput } from "./parser/types.ts"

export class PdfError extends Data.TaggedError("PdfError")<{
  readonly path: string
  readonly cause: unknown
}> {}

/** Lit un PDF et rend, page par page, les fragments de texte positionnés. */
export const loadPages = (
  path: string,
  book: number
): Effect.Effect<ReadonlyArray<PageInput>, PdfError> =>
  Effect.tryPromise({
    try: async () => {
      const doc = await getDocumentProxy(new Uint8Array(await readFile(path)))
      const pages: Array<PageInput> = []
      for (let page = 1; page <= doc.numPages; page++) {
        const { items } = await doc.getPage(page).then((p) => p.getTextContent())
        pages.push({
          book,
          page,
          items: items.flatMap((it) =>
            "str" in it && it.str !== ""
              ? [{
                  str: it.str,
                  x: it.transform[4] as number,
                  y: it.transform[5] as number,
                  width: it.width,
                  size: it.transform[3] as number,
                }]
              : []
          ),
        })
      }
      return pages
    },
    catch: (cause) => new PdfError({ path, cause }),
  })
