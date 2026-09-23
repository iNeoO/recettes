/**
 * Le contrat HTTP, partagé par le serveur et le navigateur.
 *
 * Ne contient que ce qui circule sur le réseau : ni accès base, ni stockage
 * objet, ni politique serveur — sans quoi le front les traînerait dans son
 * bundle. Les valeurs par défaut de pagination vivent dans apps/api.
 */
export * from "./recipe.ts"
export * from "./auth.ts"
export * from "./list.ts"
export * from "./api.ts"
