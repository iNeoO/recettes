import { Effect } from "effect"
import { type Line, toColumns, toLines, unspace } from "./lines.ts"
import { type Ingredient, type PageInput, ParseError, type ParsedPage, type TextItem } from "./types.ts"

/** En dessous, une taille de police n'est plus un titre mais du corps de texte. */
const TITLE_MIN_SIZE = 20

/** Une sous-section du bloc ingrédients est désindentée d'au moins ça. */
const OUTDENT = 3

const ANCHOR = /^ingr[ée]dients\b/i
const SERVINGS = /(\d+)\s*portions?/i
/** Minuscule ou parenthèse ouvrante : la ligne poursuit la précédente. */
const WRAPPED = /^[a-zà-öø-ÿ(]/

/** Ligne laissée en suspens : « 12 champignons de » attend « Paris ». */
const UNFINISHED = /\s(de|d['’]|à|au|aux|en|du|des|sans|avec)$/i

const near = (a: number, b: number) => Math.abs(a - b) < 0.01

/** L'abscisse la plus fréquente d'une colonne : son alignement de corps. */
const bodyX = (lines: ReadonlyArray<Line>): number => {
  const counts = new Map<number, number>()
  for (const l of lines) counts.set(l.x, (counts.get(l.x) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0
}

/**
 * Une ligne d'ingrédient qui déborde se poursuit sur la suivante ("2 cuillères
 * à soupe d'huile" / "d'olive", "1 boite de pois chiches" / "(220g environ)").
 * L'initiale minuscule ou la parenthèse trahit la coupure.
 */
const readIngredients = (lines: ReadonlyArray<Line>): ReadonlyArray<Ingredient> =>
  toColumns(lines).flatMap((column) => {
    const indent = bodyX(column)
    const out: Array<{ raw: string; section: string | null }> = []
    let section: string | null = null

    for (const line of column) {
      if (line.x < indent - OUTDENT) {
        section = line.text
        continue
      }
      const previous = out.at(-1)
      const continues =
        WRAPPED.test(line.text) || (previous !== undefined && UNFINISHED.test(previous.raw))
      if (previous && previous.section === section && continues) {
        previous.raw = `${previous.raw} ${line.text}`
      } else out.push({ raw: line.text, section })
    }
    return out
  })

/**
 * Les blocs d'instructions se lisent de haut en bas, quelle que soit leur
 * colonne. Un écart vertical inhabituel marque un changement d'étape.
 */
const readInstructions = (lines: ReadonlyArray<Line>): string => {
  const ordered = [...lines].sort((a, b) => b.y - a.y || a.x - b.x)
  if (ordered.length === 0) return ""

  // Un interligne vaut ~1.35 fois le corps, un saut d'étape ~2.75 fois.
  const threshold = ordered[0]!.size * 2

  return ordered
    .reduce<Array<string>>((steps, line, i) => {
      const previous = ordered[i - 1]
      if (previous && previous.y - line.y <= threshold) {
        steps[steps.length - 1] = `${steps.at(-1)} ${line.text}`
      } else steps.push(line.text)
      return steps
    }, [])
    .join("\n\n")
}

export const parsePage = (input: PageInput): Effect.Effect<ParsedPage, ParseError> =>
  Effect.gen(function* () {
    const fail = (reason: string) =>
      new ParseError({ book: input.book, page: input.page, reason })

    const items = input.items.filter((i) => i.str !== "")
    if (items.length === 0) return yield* fail("page sans texte")

    const maxSize = Math.max(...items.map((i) => i.size))
    const isTitle = (i: TextItem) => maxSize >= TITLE_MIN_SIZE && near(i.size, maxSize)
    const title = toLines(items.filter(isTitle), true)
      .map((l) => l.text)
      .join(" ")

    const servings = items.map((i) => SERVINGS.exec(i.str)).find((m) => m !== null)
    const rest = items.filter((i) => !isTitle(i) && !SERVINGS.test(i.str))

    // Une instruction peut commencer par le mot « ingrédients » ("Mélanger les
    // ingrédients du glaçage"). Seul un en-tête domine tout le corps en taille.
    const named = rest.filter((i) => ANCHOR.test(unspace(i.str).trim()))
    const anchors = named.filter((a) =>
      rest.every((i) => named.includes(i) || i.size < a.size - 0.01)
    )

    // L'en-tête et la mention de portions retirés, il ne reste que le corps :
    // sa plus grande taille est celle des instructions.
    const body = rest.filter((i) => !anchors.includes(i))

    if (body.length === 0) {
      return title === ""
        ? yield* fail("page sans titre ni corps")
        : ({ kind: "divider", category: title } as const)
    }

    const instructionSize = Math.max(...body.map((i) => i.size))
    const instructions = readInstructions(
      toLines(body.filter((i) => near(i.size, instructionSize)))
    )

    if (anchors.length === 0) {
      return { kind: "continuation", title: title === "" ? null : title, instructions } as const
    }

    const ingredients = readIngredients(
      toLines(body.filter((i) => !near(i.size, instructionSize)))
    )

    if (title === "") return yield* fail("titre introuvable")
    if (ingredients.length === 0) return yield* fail("bloc ingrédients vide")
    if (instructions === "") return yield* fail("instructions introuvables")

    return {
      kind: "recipe",
      title,
      servings: servings ? Number(servings[1]) : null,
      ingredients,
      instructions,
    } as const
  })
