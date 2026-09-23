# Raccourcis de développement. `make` seul affiche l'aide.
# Tout passe par pnpm et docker compose : rien ici ne duplique de logique.

.DEFAULT_GOAL := help
.PHONY: help env install up down restart ps logs garage-init migrate ingest user setup dev api web test typecheck

help: ## Affiche cette aide
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) \
		| awk -F':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

env: ## Vérifie la présence de .env (le crée depuis .env.example sinon)
	@test -f .env || { cp .env.example .env; \
		echo "⚠️  .env créé depuis .env.example — remplir les secrets, puis relancer"; \
		exit 1; }

install: ## Installe les dépendances du workspace
	pnpm install

up: env ## Démarre Postgres + Garage et attend qu'ils soient prêts
	docker compose up -d --wait

down: ## Arrête les conteneurs
	docker compose down

restart: down up ## Redémarre les conteneurs

ps: ## État des conteneurs
	docker compose ps

logs: ## Suit les logs des conteneurs
	docker compose logs -f

garage-init: up ## Dispose Garage, importe la clé S3, crée le bucket (idempotent)
	./scripts/garage-init.sh

migrate: up ## Applique les migrations Drizzle
	pnpm --filter @recettes/db migrate

ingest: up ## Ingère ou met à jour les PDF (list1.pdf et list2.pdf requis à la racine)
	pnpm ingest

user: up ## Crée un compte : make user EMAIL=anne@example.org (mot de passe lu sur stdin)
	@test -n "$(EMAIL)" || { echo "usage : make user EMAIL=..."; exit 1; }
	@pnpm --filter @recettes/api --silent create-user $(EMAIL)

setup: install garage-init migrate ## Poste neuf : dépendances, Garage, base migrée
	@echo "Prêt. 'make ingest' pour peupler la base, puis 'make dev'."

dev: up ## Lance l'API (:3000, doc sur /docs) et le front (:5173)
	pnpm dev

api: up ## Lance uniquement l'API
	pnpm --filter @recettes/api dev

web: ## Lance uniquement le front (l'API doit déjà tourner)
	pnpm --filter @recettes/web dev

test: ## Lance tous les tests
	pnpm test

typecheck: ## Typecheck tous les packages
	pnpm typecheck
