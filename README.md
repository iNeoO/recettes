# recettes

Extraction des deux annexes de recettes (PDF) vers Postgres + Garage.

**887 recettes**, 9 790 ingrédients, 879 photos, en ~45 s.

## Prérequis

- Node 24, pnpm 10, Docker
- **poppler-utils** (`pdfimages`) — l'extraction des images passe par lui, ce qui
  préserve les octets JPEG d'origine au lieu de les réencoder
- `list1.pdf` et `list2.pdf` à la racine — ils ne sont pas versionnés
  (163 et 127 Mo, au-dessus de la limite de 100 Mo par fichier de GitHub)

## Démarrage

```sh
cp .env.example .env     # puis remplir les secrets (voir les commentaires)
docker compose up -d
./scripts/garage-init.sh # disposition Garage, clé S3, bucket — idempotent
pnpm install
pnpm --filter @recettes/db migrate
pnpm ingest
make user EMAIL=anne@example.org   # mot de passe lu sur stdin
```

Les recettes sont derrière une authentification et l'API n'expose aucune
inscription : les comptes se créent en ligne de commande, sur le poste qui a
accès à la base.

## Structure

```
packages/db      schéma Drizzle, migrations, couche Effect
apps/ingest      parser PDF, extraction des images, CLI d'ingestion
apps/api         serveur HTTP Effect (domaine / infra / http)
apps/web         SPA React (TanStack Router + Query, Tailwind)
packages/contract  schemas Effect + definition HttpApi, partages api <-> web
```

## Modele

```
recipes(id, book, page, title, category, servings, instructions, image_key)
        UNIQUE(book, page)
ingredients(id, name UNIQUE)                       <- referentiel deduplique
recipe_ingredients(recipe_id, ingredient_id, position, section, quantity, raw)
```

`ingredients.name` est canonique : « huile d'olive » est une seule entree, quelle
que soit la recette. `quantity` est une chaine (« 200g », « 1/2 », « 2 cuilleres
a soupe », « pincee ») **toujours ramenee a 2 portions**. `raw` conserve la ligne
du PDF dont l'entree est issue : aucune perte, et le decoupage reste verifiable.
`servings` vaut 2, ou null pour les 47 recettes dont le rendement ne s'exprime
pas en parts (muffins, pains, boissons) et qui ne sont donc pas mises a l'echelle.

### Comment les ingredients ont ete decoupes

Les lignes imprimees (« 2 cuilleres a soupe d'huile d'olive », « Sel, poivre »)
ne se decoupent pas en regles : il faut du jugement pour savoir que « Sel,
poivre » est deux ingredients et que « 50g de beurre ou margarine » n'en est
qu'un. Ce decoupage a donc ete fait par des agents LLM, **une seule fois**, et
leur sortie est versionnee dans `apps/ingest/data/parsed/`.

```
9 737 lignes imprimees
  -> 4 476 distinctes (apostrophes et espaces normalisees)
  -> 12 tranches, un agent par tranche, couverture verifiee 4476/4476
  -> data/parsed/*.json : ligne -> [{name, amount?, unit?}]
  -> 10 400 liaisons, 653 ingredients canoniques (1 147 avant alias)
```

Douze agents independants nomment parfois differemment (« puree de tomate » /
« puree de tomates »). Les variantes sont unifiees par `data/aliases.json`, une
table **relue**, jamais une regle de pluriel automatique : celle-ci fusionnerait
« pate » et « pates », qui sont des ingredients distincts. `suggest-aliases`
propose, le fichier decide.

La table va plus loin que les doublons d'ecriture : elle fusionne ce qui
s'achete pareil, arbitre avec l'utilisateur famille par famille (oignon jaune ->
oignon, mais oignon rouge a part ; vegetal -> animal ; tous les sucres ; formes
de pates ; farines sauf T110). Une regle d'unite posee sur une variante est
morte : elle se reporte sur le nom retenu dans `units.json`.

Consequence : **la migration elle-meme est du code pur**. Elle lit l'artefact,
applique le facteur d'echelle, formate les quantites et deduplique les noms —
donc elle est testable et rejouable sans jamais rappeler un LLM.

```sh
pnpm --filter @recettes/ingest export-lines    # regenere les tranches
pnpm --filter @recettes/ingest check-catalog   # verifie la couverture
pnpm --filter @recettes/ingest verify          # controle le resultat en base
```

`check-catalog` echoue si une ligne n'est pas couverte, et l'ingestion refuse de
deviner : une ligne inconnue du catalogue est rapportee comme les autres echecs,
avec sa recette et sa page.

## Comment le parser s'y prend

Les PDF sont produits par Canva et ont une couche texte exploitable. Chaque
fragment vient avec sa position et son corps de police, et les tailles sont
remarquablement régulières :

| corps | rôle |
|-------|------|
| 37–50 | titre (50 sur les pages séparatrices) |
| 14,8  | l'en-tête `Ingrédients` |
| 12,0  | instructions |
| 10,0  | `N portions` |
| 8,9   | ingrédients |

Le parser ne code aucune de ces valeurs en dur. Il retire le titre (corps
maximal), l'en-tête et la mention de portions ; il ne reste alors que deux
classes de taille, la plus grande étant les instructions. Une page sans en-tête
est une continuation de la précédente ; une page où il ne reste rien est un
séparateur de catégorie.

Trois pièges, chacun couvert par une fixture :

- Canva écrit les titres lettre par lettre (`B o w l`) — ils sont recollés
- Les ingrédients sur deux colonnes partagent la même ordonnée : les colonnes
  sont trouvées par couloir blanc vertical sur tout le bloc, jamais par le blanc
  restant sur une ligne (qui peut tomber à 6pt)
- Une instruction peut commencer par le mot « ingrédients » : seul un en-tête
  domine tout le corps en taille

## Tests

```sh
pnpm test
```

- `units.test.ts` — conversions, unité par défaut, règles, fichier `units.json`.
- `parser.test.ts` — 10 fixtures JSON figées, sans PDF, quelques millisecondes.
  C'est la boucle de travail. Chaque cas vient d'une page réelle qui a posé
  problème.
- `corpus.test.ts` — les 921 pages, ~5 s, sauté si les PDF sont absents.
  Vérifie 486 + 401 recettes, chacune avec titre, ingrédients et instructions,
  `(livre, page)` unique, 15 catégories.

Régénérer les fixtures après avoir ajouté un cas :

```sh
cd apps/ingest && node scripts/make-fixtures.mjs
```

## Unités d'achat et `units.json`

Chaque ligne recette-ingrédient porte, à côté du texte affiché (`quantity`),
la même quantité **dans l'unité d'achat de l'ingrédient** (`amount`, `unit`),
pour la liste de courses. Les conversions universelles vivent dans le code
(`cl`, `dl`, `l` → `ml` ; `kg`, `mg` → `g` ; cuillère à soupe = 15 ml, cuillère
à café = 5 ml ; sans unité = `pièce`). Les sauts de famille se décident
ingrédient par ingrédient dans `data/units.json`, **relu à la main** :

```json
{
  "farine":        { "unit": "g",      "factors": { "cuillère à soupe": 10 } },
  "ail":           { "unit": "gousse", "factors": { "g": 0.2 } },
  "huile d'olive": { "invariant": true }
}
```

`unit` est l'unité d'achat (défaut : la plus fréquente du corpus pour cet
ingrédient), `factors` dit « 1 unité vue = k unités d'achat », `invariant`
envoie l'ingrédient au placard sans quantité. Une ligne devient **invariante**
(`amount` et `unit` à `NULL`) si l'ingrédient l'est, si la recette n'a pas de
portions, si la ligne n'a pas de nombre, ou si aucun facteur ne relie son unité
à l'unité d'achat. On ne fait pas de la chimie : un facteur approximatif vaut
mieux qu'une ligne non agrégée.

```sh
pnpm --filter @recettes/ingest suggest-units   # ce qui mélange des familles, candidats invariants
pnpm --filter @recettes/ingest check-units     # ce qui reste invariant faute de facteur
```

## Réingestion

`pnpm ingest` se rejoue autant de fois qu'on veut : les recettes sont mises à
jour sur `(livre, page)` et les ingrédients sur leur nom, sans changer
d'identifiant (`upsertRecipes` dans `packages/db`, une transaction par livre).
Seules les lignes recette-ingrédient sont remplacées. Les images déjà présentes
dans Garage ne sont pas réenvoyées. Les pages non
analysables n'interrompent pas l'ingestion : tout ce qui passe est inséré, et
un rapport final liste les échecs avec un code de sortie non nul.

## Vérifier le résultat

```sh
cd apps/ingest && node --env-file=../../.env --import tsx scripts/quality.ts
cd apps/ingest && node --env-file=../../.env --import tsx scripts/verify-storage.ts
```


---

# API

```sh
pnpm --filter @recettes/api dev     # http://localhost:3000, doc sur /docs
```

## Endpoints

```
GET /recipes?search=&category=&book=&limit=20&offset=0
    -> { items, total, limit, offset }   (chaque item porte ses `highlights`)
GET /recipes/:id        -> recette complete, ingredients ordonnes
GET /recipes/:id/image  -> les octets depuis Garage, avec leur vrai type

POST /auth/login   { email, password } -> { id, email } + cookie `session`
POST /auth/logout  -> 204, cookie effacé (toujours, même sans session)
GET  /auth/me      -> { id, email }

GET    /lists                          -> [{ id, name, servings, status, createdAt, recipeCount }]
POST   /lists          { meals }       -> 201, la liste en `draft` (nom = date du jour,
                                          2 personnes, `meals` plats distincts tirés, 0 à 21)
GET    /lists/:id                      -> { id, name, servings, status, createdAt, recipes,
                                          items, pantry }
PATCH  /lists/:id          { servings } -> la liste
DELETE /lists/:id                      -> 204
GET    /lists/:id/suggestions?count=6  -> [RecipeSummary] (plats salés au hasard, hors
                                          ceux de la liste, 1 à 12)
POST   /lists/:id/finalize             -> la liste en `ready` (409 EmptyList sans plat)
POST   /lists/:id/reopen               -> la liste en `draft`
POST   /lists/:id/recipes  { recipeId } -> la liste (sans effet si le plat y est déjà)
DELETE /lists/:id/recipes/:recipeId    -> la liste (le plat en moins)
POST   /lists/:id/recipes/:recipeId/replace { recipeId }
                                       -> la liste (le plat remplacé par celui choisi,
                                          à la même place)
PUT    /lists/:id/checks/:ingredientId { checked } -> 204
```

Une liste appartient à son créateur : celle d'un autre est un `404 ListNotFound`
sur chaque endpoint, jamais un 403. `items` porte les ingrédients chiffrés,
sommés par nom et mis à l'échelle de `servings` (les recettes sont ramenées à 2),
`pantry` ceux dont aucune ligne n'est chiffrée. Les nombres sortent bruts,
l'arrondi est affaire d'affichage.

Une liste est `draft` tant qu'on en choisit les plats, `ready` quand elle sert
au magasin. Hors `draft`, ajouter, retirer ou remplacer un plat rend
`409 ListNotDraft` ; le nombre de personnes et les cases restent modifiables.
Le statut est lu sous verrou (`SELECT … FOR UPDATE`) dans la transaction de la
modification : une validation concurrente ne passe pas entre les deux.

Une liste ne contient pas deux fois le même plat : l'ajout est idempotent, et
remplacer par un plat déjà présent retire simplement le plat remplacé. `count`
reste dans la réponse pour les listes antérieures, qui peuvent en avoir.

Le tirage pioche parmi les plats salés : tout sauf les catégories de
`NOT_MEALS` (`domain/meals.ts` : sucré, boissons, pains, apéritifs), soit 671
recettes sur 887. Il mélange le pool par le service `Random` d'Effect et en
prend les premiers, donc sans remise. Les suggestions retirent d'abord du pool
les plats de la liste.

`highlights` résume une recette par ses trois premiers ingrédients chiffrés,
dans l'ordre imprimé : les invariants (sel, huile, herbes) ne disent pas ce
qu'il y a dedans. Une requête par page ou par liste (`infra/highlights.ts`),
partagée par le catalogue et les listes. La fiche complète n'en a pas besoin :
elle a les ingrédients.

Tout sauf `/auth/login`, `/auth/logout` et `/docs` exige le cookie de session ;
sans lui, `401 { "_tag": "Unauthorized" }`.

`search` porte sur le titre **et** les ingredients, sans tenir compte des
accents : `creme` trouve `creme`. Les filtres se combinent en ET.

```sh
curl -c jar -X POST -H 'content-type: application/json' \
     -d '{"email":"anne@example.org","password":"..."}' localhost:3000/auth/login
curl -b jar 'localhost:3000/recipes?search=creme&book=2&limit=3'
curl -b jar localhost:3000/recipes/444
```

## Authentification

| Question | Retenu | Écarté |
|---|---|---|
| Transport | Cookie `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` | Bearer |
| Jeton | 32 octets aléatoires ; **SHA-256 stocké**, jamais le jeton | JWT |
| Mots de passe | argon2id (`@node-rs/argon2`), m=19456 t=2 p=1 | scrypt, bcrypt |
| Durée | fixe, 7 jours depuis la connexion | glissante |
| Horloge | `Clock` d'Effect, passée en paramètre lié à la requête | `now()` de Postgres |
| Identifiant | e-mail, index unique sur `lower(email)` | pseudo |
| Création de compte | `make user`, mot de passe sur stdin | inscription par l'API |
| Anti-bruteforce | **rien**, choix explicite | limite par e-mail / IP |

**Pourquoi le cookie** : `RecipeCard` et `Detail` chargent les photos par
`<img src>`, qui ne peut pas porter d'en-tête `Authorization`. Le cookie part
tout seul ; `Path=/` est indispensable puisque le front appelle
`/api/auth/login` et que le navigateur limiterait sinon le cookie à `/api/auth`.

**Pourquoi l'horloge Effect** : si la validité s'écrivait `expires_at > now()`,
c'est Postgres qui déciderait et le test « le 8e jour, 401 » serait impossible.
`Sessions` lit `Clock.currentTimeMillis` et le passe au `SessionStore` ; les
tests fournissent une horloge décalable (`test/clock.ts`).

**Adresse inconnue** : `Users.authenticate` vérifie quand même un hash leurre,
calculé au démarrage. Le temps de réponse ne révèle pas quels comptes existent,
et la réponse est octet pour octet la même qu'un mauvais mot de passe.

**Le piège principal** : `/recipes/:id/image` est montée *devant* l'API par
`withImageRoute`, donc le middleware `Authentication` du contrat ne la voit
jamais. `serveImage` appelle `Sessions.verify` en tête, à la main. Le test
« refuse sans cookie : liste, détail et image » est le garde-fou de cette
exception : il ne doit jamais être supprimé.

## Architecture

```
domain/   repository.ts (RecipeRepository, ImageStore)
          users.ts (UserRepository, PasswordHasher, Users)
          session.ts (SessionStore, Sessions)
          shopping-lists.ts (ShoppingListRepository, scaled, listName)
          - aucun import de drizzle
infra/    repository-drizzle.ts - image-store-garage.ts
          users-drizzle.ts - sessions-drizzle.ts - argon2.ts
          shopping-lists-drizzle.ts
http/     handlers.ts - auth-handlers.ts - list-handlers.ts
          auth-middleware.ts - image-route.ts - errors.ts - server.ts
scripts/  create-user.ts
```

Un port par raison de changer : `RecipeRepository` ne connait que le SQL,
`ImageStore` que le stockage objet, `PasswordHasher` que argon2. `Users` et
`Sessions` sont les deux services du domaine qui portent une règle (leurre,
empreinte du jeton, durée) ; les autres endpoints appellent leur port
directement, sans couche use-case qui ne ferait que retransmettre.

Le contrat `HttpApi` est declaratif : les handlers ne compilent pas s'ils ne
rendent pas le type annonce, et l'OpenAPI comme le client type en decoulent.
`RepositoryError` n'y figure pas -- une panne de base n'est pas une erreur
metier ; elle est journalisee et devient un 500.

**Une exception assumee** : `/recipes/:id/image` vit hors du contrat, dans
`http/image-route.ts`. `HttpApiSchema.Uint8Array()` impose un `Content-Type`
statique, or les photos sont tantot JPEG tantot PNG. La route est intercalee
devant l'API par `withImageRoute`, et elle est totale par construction --
montee en tete, une erreur non traitee ferait tomber l'application entiere.

## Pagination

`ORDER BY title, id`. Le departage par `id` n'est couvert par aucun test : sur
un jeu de donnees de test, Postgres rend un ordre stable meme sans lui. Il est
la parce qu'il est correct, pas parce qu'un test l'exige.

## Tests

```sh
pnpm --filter @recettes/api test
```

49 tests d'integration contre une base `recettes_test` **creee et migree
automatiquement** -- la base de developpement et ses 887 recettes ne sont
jamais touchees. Chaque test seme ses propres donnees, puis appelle l'API par
le client type engendre depuis le contrat : changer une reponse sans changer le
test ne compile plus.

L'endpoint image depose un vrai objet dans Garage et le relit, pour verifier
que les octets et le `Content-Type` traversent correctement.

Côté authentification : 401 sans cookie sur la liste, le détail **et l'image** ;
mauvais mot de passe et adresse inconnue rigoureusement identiques ; horloge
avancée de 6 jours puis de 2 (200 puis 401) ; déconnexion qui révoque ; jeton
forgé refusé ; la table `sessions` ne contient aucun jeton utilisable ; un test
unitaire vérifie que le leurre est bien haché pour une adresse inconnue.

`lists.test.ts` : agrégation par nom avec les invariants au placard, mise à
l'échelle, ajout idempotent, cases qui survivent aux changements, liste
d'un autre introuvable partout, suppression qui ne touche pas les recettes,
validation et réouverture, plats figés hors brouillon, liste vide non
validable, tirage sans doublon limité aux plats salés, suggestions hors plats
de la liste, remplacement choisi à la même place.

`persist.test.ts` prouve l'idempotence de l'ingestion : rejouée, elle ne change
ni identifiants ni contenu ; une recette modifiée garde son identifiant et voit
ses lignes remplacées. Il vit ici parce que c'est la seule suite branchée sur
une base.

## Identifiants

`/recipes/42` designe la meme recette apres chaque `pnpm ingest` : l'ingestion
met a jour sur `(livre, page)` au lieu de tout recreer. Les listes de courses
peuvent donc referencer les recettes et les ingredients par identifiant.


## Ce que la normalisation donne

Une recette imprimee pour 6, rendue pour 2 :

```
167g                 feuille de lasagne     <- 500g de feuilles de lasagne
2/3                  oignon                 <- 2 oignons
2                    clou de girofle        <- 6-8 clous de girofle
1/3 gousse           ail                    <- 1 gousse d'ail
30ml                 vin rouge              <- 90ml de vin rouge
```

Et une ligne qui en cachait deux :

```
—                    sel                    <- Sel, poivre
—                    poivre                 <- Sel, poivre
```

## Limites connues

- 33 lignes sont deux colonnes collees **sans aucun blanc** par l'extracteur PDF
  (« 1 citron1 cuillere a soupe d'huile »). Geometriquement irrecuperables ;
  ce sont les agents qui les ont redecoupees.
- Les agents ont infere quelques noms de marque vers leur ingredient generique
  (« Taifun » -> tofu, « La Vie » -> bacon vegetal). Leurs rapports, dans les
  transcripts de la session, listent ces arbitrages.
- 20 lignes sont sans substance (fragments type « 12 unites ») et ne produisent
  aucun ingredient.
- `quantity` est une chaine : elle s'affiche, elle ne se recalcule pas. Une mise
  a l'echelle vers un autre nombre de portions demanderait de conserver
  `amount` et `unit` en base, ce qui n'est pas fait.
- **Aucune limitation sur `/auth/login`.** Un bourrinage lent n'est pas entravé,
  et argon2id à 19 Mio par tentative est un levier de déni de service bon marché.
- Il n'y a pas de changement de mot de passe. Le jour où il existera, il devra
  décider s'il révoque les sessions ouvertes ; combiné au point précédent, un mot
  de passe compromis resterait sinon exploitable jusqu'à 7 jours.
- Les sessions expirées ne sont pas purgées : les lignes s'accumulent.
- Le snapshot drizzle-kit (`migrations/meta/0000_snapshot.json`) est resté à la
  migration 0000 : `drizzle-kit generate` demande une résolution interactive.
  Les migrations 0001 à 0003 sont écrites à la main et inscrites dans le journal.


---

# Production

```sh
cp .env.docker.example .env.docker   # puis remplir (Postgres, clé Garage, port)
make prod-up                          # construit, migre, démarre
make prod-user EMAIL=anne@example.org # mot de passe sur stdin
make prod-ingest                      # une fois : lit PDF_DIR, remplit base et Garage
```

`docker-compose.prod.yaml` suit le modèle de `brief` : une seule construction
(`Dockerfile`) avec trois cibles, choisies par service.

| Service | Cible | Rôle |
| --- | --- | --- |
| `postgres` | — | Postgres 17, volume `recettes-pgdata-prod`, publié sur loopback (`PG_HOST_PORT`) |
| `db-migrate` | `api` | `drizzle-kit migrate`, s'exécute avant l'API et s'arrête |
| `api` | `api` | le serveur Effect, lancé par tsx, `LOG_FORMAT=json` |
| `web` | `web` | nginx : la SPA construite, `/api/*` renvoyé vers l'API, publié sur loopback (`WEB_HOST_PORT`) |
| `ingest` | `ingest` | l'API plus `poppler-utils`, profil `tools`, PDF montés depuis `PDF_DIR` |

Garage n'est pas dans ce stack : c'est le `garage-prod` du dépôt `infra`, joint
par le réseau externe `garage-network`, avec une clé et un bucket dédiés (les
commandes sont dans `.env.docker.example`). Le reverse proxy de la machine
termine le HTTPS et renvoie vers `127.0.0.1:WEB_HOST_PORT` ; le cookie de
session est `Secure`, il ne marchera pas en HTTP clair.

L'ingestion en production tourne dans un conteneur, avec les PDF montés en
lecture seule : rien à installer sur la machine. Elle est idempotente, on la
relance après chaque arbitrage de `units.json`.

## Observabilité

L'API sert `GET /metrics` au format Prometheus, toutes les séries préfixées
`recettes_api_` :

| Série | Ce qu'elle dit |
| --- | --- |
| `recettes_api_process_*`, `recettes_api_nodejs_*` | le processus : boucle d'événements, tas, GC |
| `recettes_api_http_request_duration_seconds` | latence et taux d'erreur par `route`, `method`, `status_class` |
| `recettes_api_logins_total{result}` | connexions réussies et refusées — le login n'a aucune limitation, c'est ici qu'un bourrinage se voit |

`route` est un jeu **fermé** (`KNOWN_ROUTES` dans `apps/api/src/http/metrics.ts`) :
une route ajoutée au contrat s'y ajoute, sinon elle se compte en `other`. La
route image et `/docs` comptent aussi ; `/metrics` s'exclut dans les requêtes
Grafana.

Le point de scrape n'a **pas d'authentification**. Il n'est pas fait pour être
joignable de l'extérieur : le conteneur `api` rejoint le réseau externe
`monitoring-shared` et le Prometheus du dépôt `observability` le lit là, par
son nom (`recettes-api-prod:3000`). nginx refuse `/api/metrics` d'un 404 ; ce
refus est la seule barrière, ne pas le retirer.

Chaque requête écrit aussi une ligne de journal (`route`, `method`, `status`,
`durationMs`), en JSON quand `LOG_FORMAT=json` : Promtail les envoie à Loki, et
le tableau de bord `Recettes Observability` (`observability/grafana/dashboards/`)
les affiche à côté des métriques. Le niveau est dans `logLevel`, en majuscules.

---

# Front (apps/web)

```sh
pnpm --filter @recettes/api start     # port 3000
pnpm --filter @recettes/web dev       # http://localhost:5173
```

SPA React : une page de connexion, une liste filtrable et paginee, le detail
d'une recette, et les listes de courses.

## Le contrat est partage, pas recopie

`packages/contract` porte les schemas et la definition `HttpApi`. Le serveur
l'implemente, le navigateur en derive un client type par `HttpApiClient` :
changer une reponse cote serveur **casse la compilation du front**. Le package
ne contient que ce qui circule sur le reseau — ni drizzle, ni AWS SDK, ni
politique serveur (`normalize` et `RecipeQuery` sont restes dans `apps/api`).

Le front reduit ce client a deux ports etroits (`RecipesApi`, deux methodes ;
`AuthApi`, trois), comme `RecipeRepository` cote serveur : les tests en
fournissent un faux en quelques lignes, sans imiter tout `HttpApiClient` ni le
moindre `as`. Un 401 ressort en `Unauthenticated`, reconnaissable par
`instanceof` ; au login, en `InvalidCredentials`.

## Les listes de courses

`/lists` énumère les listes (badge « Brouillon » pour celles en `draft`) et en
crée une à partir d'un nombre de repas (5 par défaut, 0 à 21) : le serveur tire
les plats, le front ouvre la préparation.

`/lists/:id/plats`, la préparation, montre chaque plat en carte (photo, titre,
ingrédients phares) avec « Remplacer » et « Retirer », puis « Ajouter un plat »
et, collé en bas, « Valider les plats » (désactivé tant que la liste est vide).
« Remplacer » et « Ajouter » ouvrent le même drawer (`MealDrawer`, sur le
`Drawer` de `@base-ui/react`) : sans filtre, 6 plats au hasard et « Autres
propositions » ; avec une recherche ou une catégorie, les résultats de
`GET /recipes`, paginés par « Voir plus », où les plats déjà dans la liste sont
marqués et non choisissables. Le contenu du drawer est démonté à la fermeture :
chaque ouverture repart d'un tirage neuf.

`/lists/:id` montre les plats, le nombre de personnes, les ingrédients à
acheter et le placard, tous cochables, et « Modifier les plats » qui rouvre la
liste. Chaque page redirige vers l'autre si le statut ne lui correspond pas ;
une mutation refusée (liste validée dans un autre onglet) relit la liste, et la
redirection fait le reste. Chaque
mutation du serveur rend la liste complète : `useShoppingList` l'écrit
directement dans le cache TanStack Query au lieu de la redemander. Cocher est
optimiste. Les quantités s'arrondissent à l'affichage (`src/quantity.ts`) :
« 350 g », « 1,2 kg », « 2 gousses », et le nombre seul pour les pièces.

Trois ports côté front : `RecipesApi`, `AuthApi`, `ShoppingListApi`, chacun
avec son faux dans `test/fake-api.ts`. Le faux des listes tient un état, ce qui
permet de vérifier qu'une case cochée survit à un rechargement.

## La session

Le cookie est `httpOnly` : le front ne le voit jamais. `createSession` garde
l'utilisateur en mémoire après un seul `GET /auth/me`, et la route parente
`authenticated` le consulte dans `beforeLoad` à chaque navigation : sans
session, `redirect` vers `/login?redirect=<destination>`, puis retour à la
destination après connexion. Un 401 en cours de session (`useAuthGuard`)
repart vers `/login` de la même façon.

Le paramètre `redirect` est validé comme **chemin interne** par
`validateSearch` (`/…`, ni `//` ni `/\`) : sans cela, un lien de connexion
forgé renverrait n'importe où après le mot de passe.

La déconnexion appelle `POST /auth/logout`, navigue vers `/login`, **puis**
vide le cache TanStack Query. Dans cet ordre : tant que la liste est montée,
elle re-remplirait le cache. Sans conséquence aujourd'hui (les recettes sont les
mêmes pour tous), indispensable dès les listes de courses par utilisateur.

## Les filtres vivent dans l'URL

`?search=creme&book=2&category=Boissons&offset=20` est partageable, et le bouton
Retour depuis une recette rend la liste **filtree**. TanStack Query est clee sur
ces parametres : le retour s'affiche depuis le cache, sans requete ni
clignotement.

Un piege a connaitre : `validateSearch` du routeur est **additif**, pas
substitutif — il fait `Object.assign(brut, resultat)`. Rendre `{}` sur une URL
invalide ne l'assainit donc pas. `src/search.ts` rend toutes les cles,
`undefined` comprises, et valide **champ par champ** : un `?limit=99999` aberrant
ne fait pas perdre un `?search=creme` valide.

## Origine

Le proxy Vite renvoie `/api` vers le serveur : meme origine, donc aucun CORS, et
le prefixe evite que `/recipes/42` de la SPA soit avale par l'API. `imageUrl`
arrive en `/recipes/42/image` et est prefixe par `imageSrc()`, seul endroit du
front ou une URL se fabrique.

## Tests

```sh
pnpm --filter @recettes/web test
```

53 tests sur la chaine reelle avec des clients factices : taper dans la recherche
met a jour l'URL **et** la requete emise, changer de page conserve les filtres,
une URL bricolee ne blanchit pas la page, `imageUrl` est prefixe, une photo
absente devient une mention et non une image cassee. Côté session : sans
utilisateur on atterrit sur `/login` avec la destination retenue et sans avoir
appelé l'API, la connexion y revient, un `redirect` externe est ignoré, des
identifiants refusés s'affichent, la déconnexion vide le cache, un 401 en cours
de route renvoie vers `/login`. Côté listes : créer ouvre la préparation,
chaque page redirige selon le statut, le drawer remplace par la proposition
choisie, relance un tirage, marque en recherche les plats déjà présents,
valider mène aux courses et modifier en revient, les quantités s'arrondissent
comme convenu, cocher appelle l'API et reste coché après rechargement,
supprimer demande deux clics.

Ce qui n'est pas couvert : jsdom n'est pas un navigateur, donc la mise en page
n'est pas verifiee par les tests. Elle a ete controlee a la main (bureau, mobile,
liste, detail).

## Mobile

Repassé en 375 px sur toutes les pages. L'e-mail disparaît de l'en-tête sous
`sm`, « Valider les plats » est collant (il reste sous le pouce en défilant), les
boutons d'un plat passent sous sa carte plutôt que de tronquer le titre, le
drawer monte à 85 % de la hauteur, la grille des recettes fait deux colonnes dès
le téléphone, et toutes les cibles tactiles (Remplacer, Retirer, cases, nombre
de personnes) font au moins 40 px.

## Limite connue

Les 15 categories du menu deroulant sont une constante du front
(`src/categories.ts`), pas une reponse de l'API — qui n'expose aucun endpoint
de categories. Elles viennent des PDF et ne changeraient qu'a une reingestion
sur des livres differents. L'API accepte toujours une chaine libre.
