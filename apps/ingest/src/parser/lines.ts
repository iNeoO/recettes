import type { TextItem } from "./types.ts"

/** Une ligne visuelle : des items contigus sur une même ordonnée, dans une même colonne. */
export interface Line {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly size: number
  readonly column: number
}

/** Deux items sont sur la même ligne si leurs ordonnées sont à moins de ça. */
const Y_TOLERANCE = 1.5

/** Largeur minimale d'un couloir blanc séparant deux colonnes. */
const MIN_CORRIDOR = 5

/**
 * Canva écrit les titres lettre par lettre : pdfjs rend "B o w l".
 * Un item dont tous les mots font une seule lettre est un mot éclaté.
 */
export const unspace = (str: string): string => {
  const words = str.split(" ")
  return str.trim().length > 1 && words.every((w) => w.length <= 1)
    ? words.join("")
    : str
}

/**
 * Abscisses où couper les lignes en colonnes.
 *
 * On cherche les couloirs blancs verticaux sur l'ensemble du bloc, et non le
 * blanc restant sur chaque ligne : une ligne longue de la colonne de gauche
 * peut n'en laisser que 11pt alors que le couloir en fait 21.
 */
const corridors = (items: ReadonlyArray<TextItem>): ReadonlyArray<number> => {
  const spans = items
    .map((i) => [i.x, i.x + i.width] as [number, number])
    .sort((a, b) => a[0] - b[0])

  const covered: Array<[number, number]> = []
  for (const [start, end] of spans) {
    const last = covered.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else covered.push([start, end])
  }

  return covered
    .slice(1)
    .flatMap((block, i) =>
      block[0] - covered[i]![1] >= MIN_CORRIDOR ? [(covered[i]![1] + block[0]) / 2] : []
    )
}

/** Reconstruit les lignes visuelles, découpées aux couloirs entre colonnes. */
export const toLines = (
  items: ReadonlyArray<TextItem>,
  collapse = false
): ReadonlyArray<Line> => {
  if (items.length === 0) return []
  const cuts = corridors(items)
  const columnOf = (x: number) => cuts.filter((cut) => x >= cut).length

  const rows: Array<Array<TextItem>> = []
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0]!.y - item.y) <= Y_TOLERANCE) row.push(item)
    else rows.push([item])
  }

  return rows
    .flatMap((row) => {
      const segments = new Map<number, Array<TextItem>>()
      for (const item of row) {
        const column = columnOf(item.x)
        segments.set(column, [...(segments.get(column) ?? []), item])
      }
      return [...segments].map(([column, segment]) => ({
        text: segment.map((i) => (collapse ? unspace(i.str) : i.str)).join("").trim(),
        x: segment[0]!.x,
        y: segment[0]!.y,
        size: segment[0]!.size,
        column,
      }))
    })
    .filter((line) => line.text !== "")
}

/** Regroupe des lignes en colonnes de lecture, de la gauche vers la droite. */
export const toColumns = (
  lines: ReadonlyArray<Line>
): ReadonlyArray<ReadonlyArray<Line>> =>
  [...new Set(lines.map((l) => l.column))]
    .sort((a, b) => a - b)
    .map((column) => lines.filter((l) => l.column === column).sort((a, b) => b.y - a.y))
