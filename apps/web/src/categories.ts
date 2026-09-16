import type { Book } from "@recettes/contract"

/**
 * Les catégories telles qu'imprimées, pour alimenter le menu déroulant.
 *
 * Volontairement ici et non dans le contrat : elles viennent des PDF et
 * pourraient changer à une réingestion. L'API accepte toujours une chaîne libre
 * — cette liste est un confort d'affichage, pas une contrainte.
 */
export const CATEGORIES: ReadonlyArray<{ book: Book; name: string }> = [
  { book: 1, name: "Salades & bowls" },
  { book: 1, name: "Tartes & quiches" },
  { book: 1, name: "Pâtes & riz" },
  { book: 1, name: "Poissons & fruits de mer" },
  { book: 1, name: "Protéines végétales" },
  { book: 1, name: "Currys & plats en sauce" },
  { book: 2, name: "Soupes, veloutés et purées" },
  { book: 2, name: "Sandwich, wrap & burger" },
  { book: 2, name: "Galettes & pancakes" },
  { book: 2, name: "Crumbles et gratins" },
  { book: 2, name: "Autres recettes salées" },
  { book: 2, name: "Apéritifs /collations & petits-déjeuners salés" },
  { book: 2, name: "Pains & boulanges" },
  { book: 2, name: "Recettes sucrées" },
  { book: 2, name: "Boissons" },
]
