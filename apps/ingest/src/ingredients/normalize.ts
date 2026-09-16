/**
 * Clé de dédoublonnage d'une ligne d'ingrédient.
 *
 * Les PDF mêlent apostrophe droite et courbe (« d'huile » / « d’huile ») :
 * sans cette normalisation, 4 627 lignes distinctes au lieu de 4 514.
 */
export const normalizeLine = (raw: string): string =>
  raw
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
