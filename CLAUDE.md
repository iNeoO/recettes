# CLAUDE.md

## Le projet

Une alternative à Jow, en self-hosted : on choisit des recettes, on en tire une
**liste de courses** agrégée.

Le corpus est déjà là — 887 recettes extraites de deux annexes PDF, avec leurs
ingrédients découpés en entrées canoniques et **toutes ramenées à 2 portions**.
C'est cette normalisation qui rend la liste de courses possible : « huile
d'olive » est une seule ligne d'ingrédient quelle que soit la recette, donc
additionnable.

**État actuel** : socle terminé (ingestion, API de consultation, SPA de
navigation), **authentification** (cookie de session, comptes créés par
`make user`) et **listes de courses** (API et front) en place. Les décisions de
conception des listes sont dans `docs/liste-de-courses.md`.

Le `README.md` documente en détail le parser, l'ingestion, l'API et le front.
Le lire avant de toucher à l'un d'eux ; ce fichier-ci ne dit que ce qui s'y
ajoute.

## Commandes

`make` seul affiche l'aide. Les raccourcis utiles :

```sh
make setup      # poste neuf : deps, Garage, base migrée
make ingest     # ingère ou met à jour (list1.pdf / list2.pdf requis à la racine)
make user EMAIL=anne@example.org  # crée un compte, mot de passe sur stdin
make dev        # API :3000 (doc sur /docs) + front :5173
make test       # tous les tests
make typecheck  # tous les packages
```

Les tests API créent et migrent `recettes_test` eux-mêmes : la base de dev et
ses 887 recettes ne sont jamais touchées.

## Structure

```
packages/contract  schemas Effect + définition HttpApi — partagé api <-> web
packages/db        schéma Drizzle, migrations, couche Effect
apps/ingest        parser PDF, extraction images, CLI d'ingestion
apps/api           serveur HTTP Effect — domain / infra / http
apps/web           SPA React (TanStack Router + Query, Tailwind)
```

Workspace pnpm, catalogue pour `effect` / `typescript` / `vitest` — ajouter une
version de ces paquets passe par `pnpm-workspace.yaml`, pas par le
`package.json` local.

## Conventions

- **Effect partout** côté serveur et ingestion. Pas de `async/await` ad hoc dans
  ces chemins.
- **Ports en `Context.Tag`**, un port par raison de changer. `domain/` n'importe
  jamais drizzle ni l'AWS SDK ; les adaptateurs vivent dans `infra/`.
- **Le contrat ne se recopie pas.** Une réponse d'API change dans
  `packages/contract` ; le serveur et le front cessent de compiler tant qu'ils
  ne suivent pas. Ne rien mettre dans `contract` qui ne circule pas sur le
  réseau (ni drizzle, ni SDK, ni politique serveur).
- **Pas de `as`, pas de `any`.** Les tests fournissent de vrais faux (voir
  `apps/web/test/fake-api.ts`), pas des casts.
- **Pas de couche use-case** tant qu'elle ne ferait que retransmettre l'appel.
  `Users` et `Sessions` en sont : ils portent une règle (leurre, empreinte,
  durée), pas un simple relais.
- **Authentification** : le middleware `Authentication` du contrat fournit
  `CurrentUser` aux handlers. Un nouvel endpoint qui lit ou écrit des données
  d'un utilisateur se pose dans un groupe qui porte `.middleware(Authentication)`
  et lit `yield* CurrentUser` — jamais un `userId` dans l'URL ou le payload.
- Le code et les commentaires sont **en français**, comme le reste du dépôt.
- Commits en Conventional Commits, une modification logique par commit.

## Pièges connus

- `validateSearch` de TanStack Router est **additif** : rendre `{}` sur une URL
  invalide ne l'assainit pas. `apps/web/src/search.ts` rend toutes les clés,
  `undefined` comprises, et valide champ par champ.
- `/recipes/:id/image` vit **hors** du contrat `HttpApi`
  (`apps/api/src/http/image-route.ts`) : `HttpApiSchema.Uint8Array()` impose un
  `Content-Type` statique, or les photos sont tantôt JPEG tantôt PNG. Montée en
  tête du serveur, cette route doit rester totale par construction — **et le
  middleware `Authentication` ne la voit pas** : elle vérifie la session à la
  main, en tête. Toute autre route ajoutée devant l'API devra faire pareil ; le
  test « refuse sans cookie : liste, détail et image » ne se supprime pas.
- La validité d'une session se lit sur `Clock` d'Effect, jamais sur `now()` de
  Postgres : les tests décalent l'horloge (`apps/api/test/clock.ts`). Toute
  nouvelle règle temporelle suit le même chemin.
- `drizzle-kit generate` **bloque** sur une question interactive : le snapshot
  est resté à 0000. Les migrations s'écrivent à la main dans
  `packages/db/migrations/` et s'inscrivent dans `meta/_journal.json`.
- Choix explicites, à ne pas « corriger » sans en parler : **aucune limitation**
  sur `/auth/login`, pas de purge des sessions expirées, pas de changement de
  mot de passe (et donc pas de révocation des sessions à cette occasion).
- L'ingestion est **idempotente** (`upsertRecipes` dans `packages/db`) : les
  recettes sont mises à jour sur `(book, page)`, les ingrédients sur leur nom,
  et les identifiants ne bougent pas. Ne jamais réintroduire un `TRUNCATE` :
  les listes de courses référencent ces identifiants.
- `quantity` est une **chaîne** (« 200g », « 1/2 », « pincée ») : elle
  s'affiche telle quelle sur la fiche. La liste de courses lit `amount` et
  `unit`, normalisés à l'ingestion dans l'unité d'achat de l'ingrédient ; les
  deux à `null` veulent dire **invariant** (on en veut, sans compter).
- Le découpage des lignes d'ingrédients a été fait **une fois** par des agents
  LLM et est versionné dans `apps/ingest/data/parsed/`. L'ingestion est du code
  pur : ne jamais y rappeler un LLM. Une ligne inconnue du catalogue est
  rapportée comme un échec, pas devinée.
- `data/units.json` est une table **relue à la main**, arbitrée avec
  l'utilisateur ligne par ligne : ne jamais y écrire un facteur deviné.
  `suggest-units` prépare, `check-units` mesure ce qui reste.
- `data/aliases.json` est une table **relue à la main**. `suggest-aliases`
  propose, le fichier décide : pas de règle de pluriel automatique, elle
  fusionnerait « pâte » et « pâtes » ou les farines T45/T55/T65/T80.

## Infrastructure

Postgres + **Garage** (S3-compatible) via `docker compose`. `scripts/garage-init.sh`
est idempotent. Les secrets vivent dans `.env` (gitignoré) ; `.env.example`
documente chaque variable et ne contient que des placeholders.

Les PDF sources (`list1.pdf`, `list2.pdf`, 163 et 127 Mo) ne sont pas versionnés.
Sans eux : le parser tourne sur ses 10 fixtures JSON, `corpus.test.ts` est sauté,
et `make ingest` échoue.
