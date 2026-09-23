# Liste de courses — décisions

Design figé par un entretien `/grill-me` le 2026-09-23, après la mise en place
de l'authentification (commits `80e7171` à `31b375d`). Les quatre chantiers
sont **implémentés** ; ce document reste la trace des décisions. Lire
`CLAUDE.md` et `README.md` d'abord.

## L'usage

Un utilisateur connecté clique « Créer une liste ». La liste existe aussitôt,
nommée à la date du jour. Il parcourt les recettes en mode sélection, ajoute des
plats, règle le nombre de personnes, clique « Terminer » et arrive sur l'onglet
de la liste : les plats, puis les ingrédients agrégés, cochables au magasin. Il
peut avoir plusieurs listes en même temps et supprimer les anciennes.

## Décisions (toutes arbitrées, ne pas rouvrir sans raison)

| Question | Retenu | Écarté |
|---|---|---|
| Quantités | **Arithmétique avec conversions**, y compris entre familles (volume → masse, comptable → masse ou l'inverse) | texte seul ; famille par famille seulement |
| Où convertir | **À l'ingestion** : `amount` et `unit` normalisés dans l'unité d'achat de l'ingrédient, une fois | au moment de bâtir la liste ; table éditable dans l'interface |
| Affichage recette | `quantity` texte **inchangée** (« 2 cuillères à soupe ») ; `amount`/`unit` ne servent qu'à la liste | remplacer par la valeur convertie |
| Arbitrages | `apps/ingest/data/units.json` **relu à la main**, ligne par ligne avec l'utilisateur ; `suggest-units` propose, le fichier décide | densités génériques ; règle automatique |
| Invariant | **Propriété de la ligne** `recipe_ingredients` : `amount` et `unit` à `null`. Une ligne est invariante si l'ingrédient l'est (huile, paprika, sel), si sa recette n'a pas de portions (47 pains et boissons), ou si son unité n'a pas de facteur dans `units.json` | échec d'ingestion sur unité sans facteur |
| Unité sans facteur | invariante, signalée par `check-units` | ligne à part dans sa propre unité |
| Nombre de personnes | **un par liste**, 2 par défaut | par recette ; défaut plus surcharge |
| Sélection en cours | **côté serveur dès « Créer »** : `POST /lists/:id/recipes` à chaque ajout. « Terminer » quitte juste le mode sélection ; la liste reste modifiable | en mémoire jusqu'à « Terminer » |
| Même recette deux fois | **autorisé**, une ligne par occurrence, affiché « ×2 », quantités doublées | refusé |
| Cases à cocher | **persistées côté serveur**, par (liste, ingrédient). Changer les plats recalcule les quantités mais garde les cases | lecture seule ; lignes libres hors recettes |
| Ordre | **alphabétique**, invariants regroupés à la fin sous « Placard », cochables aussi | par plat ; par rayon |
| Nom | date du jour, fabriquée côté serveur, **doublons acceptés** | saisi ; unique |
| Arrondis (front) | masses et volumes à l'entier, « 1,2 kg » et « 1,2 l » au-dessus de 1000 ; comptables **au supérieur** (« 1,5 gousse » → « 2 gousses ») | décimales |

L'utilisateur a été explicite : « on ne fait pas de la chimie, on accepte les
aléatoires ». Un facteur approximatif est préférable à une ligne non agrégée.

## Le prérequis : une ingestion qui ne détruit plus

`pnpm ingest` fait aujourd'hui `TRUNCATE recipes RESTART IDENTITY CASCADE`
(`packages/db/src/index.ts`, `resetRecipes`). Avec `shopping_list_recipes` et
des cases cochées par ingrédient, chaque réingestion viderait les listes et
réattribuerait les identifiants. Or `units.json` va être arbitré au fil de l'eau,
donc réingéré souvent.

L'ingestion devient **idempotente** :
- `recipes` : `ON CONFLICT (book, page) DO UPDATE` ;
- `ingredients` : `ON CONFLICT (name) DO NOTHING` — les identifiants
  d'ingrédient portent les cases cochées, ils doivent survivre ;
- `recipe_ingredients` : suppression par `recipe_id` puis réinsertion.

`resetRecipes` disparaît. C'est le premier commit, avant toute table de liste.

## `units.json`

```json
{
  "farine":        { "unit": "g",      "factors": { "cuillère à soupe": 10, "cuillère à café": 3 } },
  "ail":           { "unit": "gousse", "factors": { "g": 0.2 } },
  "huile d'olive": { "invariant": true },
  "paprika":       { "invariant": true }
}
```

- `unit` : l'unité d'achat, celle de la ligne finale. Sans entrée : l'unité la
  plus fréquente pour cet ingrédient dans le corpus.
- `factors` : « 1 de cette unité = k unités d'achat », seulement pour les sauts
  de famille. Les conversions universelles vivent en code, pas ici :
  `cl→ml`, `dl→ml`, `l→ml`, `litre→ml`, `kg→g`, `mg→g`,
  `cuillère à soupe = 15 ml`, `cuillère à café = 5 ml`.
- `invariant` : la ligne apparaît sans quantité.

Mesuré sur le corpus : 1147 ingrédients, 214 avec plusieurs familles d'unités,
135 avec volume **et** masse (eau, huile d'olive, farine, beurre, bouillon,
miel, sirop d'érable…). C'est la liste de travail de la session d'arbitrage.

Scripts, sur le modèle de `suggest-aliases` : `suggest-units` (unités vues par
ingrédient, avec comptes, et une proposition), `check-units` (lignes rendues
invariantes faute de facteur).

## Schéma à créer

```sql
recipe_ingredients + amount numeric NULL, unit text NULL   -- NULL = invariant

shopping_lists(id, user_id → users ON DELETE CASCADE, name text,
               servings int NOT NULL DEFAULT 2, created_at)
  INDEX (user_id)

shopping_list_recipes(id, list_id → shopping_lists ON DELETE CASCADE,
                      recipe_id → recipes ON DELETE RESTRICT, position int)
  -- une ligne par occurrence : la même recette peut y figurer deux fois

shopping_list_checks(list_id → shopping_lists ON DELETE CASCADE,
                     ingredient_id → ingredients, checked_at,
                     PRIMARY KEY (list_id, ingredient_id))
```

Migrations à la main dans `packages/db/migrations/` plus `meta/_journal.json`
(voir CLAUDE.md : `drizzle-kit generate` bloque).

## API (groupe `lists`, `.middleware(Authentication)`)

```
GET    /lists                          → [{ id, name, servings, createdAt, recipeCount }]
POST   /lists                          → crée (nom = date du jour, servings 2) → la liste
GET    /lists/:id                      → { id, name, servings, createdAt,
                                           recipes: [{ recipeId, title, imageUrl, count }],
                                           items:   [{ ingredientId, name, amount, unit, checked }],
                                           pantry:  [{ ingredientId, name, checked }] }
PATCH  /lists/:id          { servings } → la liste
DELETE /lists/:id                      → 204
POST   /lists/:id/recipes  { recipeId } → ajoute une occurrence
DELETE /lists/:id/recipes/:recipeId    → retire une occurrence
PUT    /lists/:id/checks/:ingredientId { checked } → 204
```

- Propriété : toute liste est lue **par (id, CurrentUser.id)**. La liste d'un
  autre utilisateur est un `404 ListNotFound`, jamais un 403 : on ne confirme
  pas qu'elle existe.
- Agrégation à la lecture : `sum(amount) * servings / 2` par (ingrédient, unité)
  sur les lignes chiffrées ; un ingrédient dont **toutes** les lignes sont
  `null` va dans `pantry`. Un ingrédient à la fois chiffré et invariant va dans
  `items` avec la somme des lignes chiffrées.
- `items` trié par nom, `pantry` aussi. Les nombres circulent bruts ; l'arrondi
  est une affaire d'affichage (front).
- La date du nom se lit sur `Clock` d'Effect, comme les sessions.

## Où le code atterrit

```
apps/ingest      units.json · ingredients/units.ts (conversion) · upserts
                 scripts/suggest-units.ts · scripts/check-units.ts
packages/db      colonnes amount/unit · trois tables · migration 0004
packages/contract  list.ts (schemas + groupe lists)
apps/api/domain  shopping-lists.ts (port ShoppingListRepository, agrégation)
apps/api/infra   shopping-lists-drizzle.ts
apps/api/http    list-handlers.ts
apps/web         /lists (les listes, bouton Créer, supprimer)
                 /lists/$id (plats ×n, personnes, ingrédients cochables, Placard)
                 mode sélection sur la liste des recettes : ?list=<id> validé
                 dans search.ts, bandeau « Sélection pour <nom> · n plats ·
                 Terminer », bouton Ajouter sur chaque carte
                 header : lien « Listes »
```

Ports : `ShoppingListApi` côté web, distinct de `RecipesApi` et `AuthApi`, avec
son faux dans `test/fake-api.ts`.

## Ce que les tests doivent prouver

- ingestion rejouée deux fois : mêmes identifiants de recettes et d'ingrédients,
  listes intactes
- conversion : `2 cuillères à soupe de farine` → `20 g` ; `20 g d'ail` →
  `4 gousses` ; `paprika` → `null` ; unité sans facteur → `null` et signalée ;
  recette sans portions → toutes ses lignes `null`
- agrégation : deux recettes qui emploient la farine → une ligne, somme mise à
  l'échelle du nombre de personnes ; même recette deux fois → quantités doublées
  et `count: 2` ; ingrédient chiffré et invariant → dans `items`, pas `pantry`
- propriété : la liste d'un autre utilisateur → 404 sur chaque endpoint, création
  au nom de `CurrentUser` seulement
- cases : cochée, elle survit à l'ajout d'un plat et au changement de personnes
- suppression d'une liste : recettes et cases disparaissent, la table `recipes`
  n'est pas touchée
- front : Créer → mode sélection avec bandeau, Ajouter incrémente, Terminer
  ouvre la liste ; les quantités s'arrondissent comme convenu ; cocher appelle
  l'API et reste coché après rechargement (faux qui rend l'état) ; `?list=abc`
  est ignoré comme les autres paramètres invalides

## Ordre des chantiers

1. Ingestion idempotente (prérequis, seul commit qui touche à l'existant).
2. `amount`/`unit` + conversions + `units.json` vide + scripts. Puis **la
   session d'arbitrage avec l'utilisateur**, ligne par ligne, sur la sortie de
   `suggest-units`.
3. Tables, contrat, API, tests.
4. Front.

## Skills suggérés

- `/cns:plan` pour dérouler ce document en étapes ; `/tdd` : les cas ci-dessus
  sont déjà des tests rouges ; `/cns:commit` une modification à la fois.
- Ne pas relancer `/grill-me` : l'arbre est résolu.
