-- Listes de courses : des plats (une ligne par occurrence), un nombre de
-- personnes, des ingrédients cochés. Aucune de ces tables n'est touchée par
-- l'ingestion, qui met à jour les recettes sans les supprimer.
CREATE TABLE "shopping_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"servings" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "shopping_lists_user_id_idx" ON "shopping_lists" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "shopping_list_recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"recipe_id" integer NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_list_recipes" ADD CONSTRAINT "shopping_list_recipes_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopping_list_recipes" ADD CONSTRAINT "shopping_list_recipes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "shopping_list_recipes_list_id_idx" ON "shopping_list_recipes" USING btree ("list_id");
--> statement-breakpoint
CREATE TABLE "shopping_list_checks" (
	"list_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_list_checks_list_id_ingredient_id_pk" PRIMARY KEY("list_id","ingredient_id")
);
--> statement-breakpoint
ALTER TABLE "shopping_list_checks" ADD CONSTRAINT "shopping_list_checks_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopping_list_checks" ADD CONSTRAINT "shopping_list_checks_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
