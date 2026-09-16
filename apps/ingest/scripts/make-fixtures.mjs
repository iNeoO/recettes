import { getDocumentProxy } from 'unpdf'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

// Chaque fixture est un cas réel repéré dans les PDF, pas un cas imaginé.
const CASES = [
  ['canonique-une-colonne', 1, 2],
  ['sous-section-ingredients', 1, 3],
  ['ingredients-deux-colonnes', 1, 4],
  ['instructions-colonne-droite', 1, 60],
  ['separateur-categorie', 1, 1],
  ['continuation-avec-titre', 1, 450],
  ['recette-sans-portions', 1, 187],
  ['deux-tailles-ingredients', 1, 388],
  ['continuation-sans-titre', 2, 87],
  ['continuation-nue', 2, 218],
  ['ancre-taille-atypique', 2, 368],
  ['separateur-livre2', 2, 272],
  ['instruction-citant-ingredients', 2, 370],
  ['colonnes-rapprochees', 1, 114],
  ['colonnes-jointives', 1, 53],
  ['ingredient-coupe-sur-parenthese', 1, 54],
  ['ingredient-coupe-sur-preposition', 2, 239],
]

const docs = {}
for (const [name, book, page] of CASES) {
  docs[book] ??= await getDocumentProxy(new Uint8Array(await readFile(`list${book}.pdf`)))
  const { items } = await docs[book].getPage(page).then(p => p.getTextContent())
  const fixture = {
    book,
    page,
    items: items
      .filter(it => 'str' in it && it.str !== '')
      .map(it => ({
        str: it.str,
        x: +it.transform[4].toFixed(2),
        y: +it.transform[5].toFixed(2),
        width: +it.width.toFixed(2),
        size: +it.transform[3].toFixed(2),
      })),
  }
  await mkdir('apps/ingest/test/fixtures', { recursive: true })
  await writeFile(`apps/ingest/test/fixtures/${name}.json`, JSON.stringify(fixture, null, 2))
  console.log(`${name.padEnd(28)} livre ${book} p${String(page).padEnd(4)} ${fixture.items.length} items`)
}
