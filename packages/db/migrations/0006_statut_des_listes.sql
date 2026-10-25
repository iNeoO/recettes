-- Une liste se prépare (draft) puis sert au magasin (ready). Les listes déjà
-- créées servaient de listes de courses : elles passent en ready.
ALTER TABLE "shopping_lists" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_status_check" CHECK ("status" IN ('draft', 'ready'));
--> statement-breakpoint
UPDATE "shopping_lists" SET "status" = 'ready';
