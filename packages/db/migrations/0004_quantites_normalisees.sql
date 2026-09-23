-- La quantité d'une ligne dans l'unité d'achat de son ingrédient, pour la liste
-- de courses. quantity (texte) reste la valeur affichée sur la fiche. Les deux
-- colonnes à NULL : la ligne est invariante, on en veut sans compter.
ALTER TABLE "recipe_ingredients" ADD COLUMN "amount" double precision;
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "unit" text;
