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
```

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
  -> 10 400 liaisons, 1 147 ingredients canoniques
```

Douze agents independants nomment parfois differemment (« puree de tomate » /
« puree de tomates »). Les variantes sont unifiees par `data/aliases.json`, une
table **relue**, jamais une regle de pluriel automatique : celle-ci fusionnerait
« pate » et « pates », ou les farines T45/T55/T65/T80, qui sont des ingredients
distincts. `suggest-aliases` propose, le fichier decide.

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

## Réingestion

`pnpm ingest` vide les tables et réinsère tout — rien n'est saisi à la main.
Les images déjà présentes dans Garage ne sont pas réenvoyées. Les pages non
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
    -> { items, total, limit, offset }
GET /recipes/:id        -> recette complete, ingredients ordonnes
GET /recipes/:id/image  -> les octets depuis Garage, avec leur vrai type
```

`search` porte sur le titre **et** les ingredients, sans tenir compte des
accents : `creme` trouve `creme`. Les filtres se combinent en ET.

```sh
curl 'localhost:3000/recipes?search=creme&book=2&limit=3'
curl localhost:3000/recipes/444
```

## Architecture

```
domain/   schemas Effect - ports (Context.Tag) - aucun import de drizzle
infra/    repository-drizzle.ts - image-store-garage.ts
http/     api.ts (contrat) - handlers.ts - image-route.ts - server.ts
```

Deux ports distincts plutot qu'un : `RecipeRepository` ne connait que le SQL,
`ImageStore` que le stockage objet -- deux adaptateurs, deux raisons de changer.
Pas de couche use-case : pour ces trois endpoints elle ne ferait que
retransmettre l'appel.

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

18 tests d'integration contre une base `recettes_test` **creee et migree
automatiquement** -- la base de developpement et ses 887 recettes ne sont
jamais touchees. Chaque test seme ses propres donnees, puis appelle l'API par
le client type engendre depuis le contrat : changer une reponse sans changer le
test ne compile plus.

L'endpoint image depose un vrai objet dans Garage et le relit, pour verifier
que les octets et le `Content-Type` traversent correctement.

## Identifiants

`/recipes/42` designe une autre recette apres chaque `pnpm ingest`, parce que
l'ingestion fait `TRUNCATE ... RESTART IDENTITY`. Pour les stabiliser : passer
l'ingestion en `ON CONFLICT (book, page) DO UPDATE`. L'API n'a pas a changer.


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


---

# Front (apps/web)

```sh
pnpm --filter @recettes/api start     # port 3000
pnpm --filter @recettes/web dev       # http://localhost:5173
```

SPA React : une liste filtrable et paginee, et le detail d'une recette.

## Le contrat est partage, pas recopie

`packages/contract` porte les schemas et la definition `HttpApi`. Le serveur
l'implemente, le navigateur en derive un client type par `HttpApiClient` :
changer une reponse cote serveur **casse la compilation du front**. Le package
ne contient que ce qui circule sur le reseau — ni drizzle, ni AWS SDK, ni
politique serveur (`normalize` et `RecipeQuery` sont restes dans `apps/api`).

Le front reduit ce client a un port etroit (`RecipesApi`, deux methodes), comme
`RecipeRepository` cote serveur : les tests en fournissent un faux en quelques
lignes, sans imiter tout `HttpApiClient` ni le moindre `as`.

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

21 tests sur la chaine reelle avec un client factice : taper dans la recherche
met a jour l'URL **et** la requete emise, changer de page conserve les filtres,
une URL bricolee ne blanchit pas la page, `imageUrl` est prefixe, une photo
absente devient une mention et non une image cassee.

Ce qui n'est pas couvert : jsdom n'est pas un navigateur, donc la mise en page
n'est pas verifiee par les tests. Elle a ete controlee a la main (bureau, mobile,
liste, detail).

## Limite connue

Les 15 categories du menu deroulant sont une constante du front
(`src/categories.ts`), pas une reponse de l'API — qui n'expose aucun endpoint
de categories. Elles viennent des PDF et ne changeraient qu'a une reingestion
sur des livres differents. L'API accepte toujours une chaine libre.
