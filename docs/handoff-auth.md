# Reprise — feature authentification

**État : rien n'est implémenté.** Le design a été figé par un entretien `/grill-me`
le 2026-09-16. Ce document est la seule trace de ces décisions. Branche `master`,
dernier commit `506aa6b` (socle complet, working tree propre).

Lire `CLAUDE.md` et `README.md` d'abord ; ce document ne redit ni l'architecture
ni les conventions.

## Objectif

Protéger les recettes derrière une authentification. Les listes de courses par
utilisateur sont la feature **suivante** — elles ne sont pas à implémenter, mais
le design doit les accueillir sans se contredire.

Cadrage donné par l'utilisateur :
- token valide 1 semaine
- pas de déconnexion au changement de mot de passe
- pas de validation de compte
- les fonctions de création de compte existent, mais ne sont pas exposées par l'API

## Décisions (toutes arbitrées, ne pas rouvrir sans raison)

| Question | Retenu | Écarté |
|---|---|---|
| Transport | Cookie `httpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=604800` | Bearer |
| Nature du token | 32 octets aléatoires ; **SHA-256 stocké en base**, jamais le token | JWT |
| Mots de passe | **argon2id** via `@node-rs/argon2`, m=19456 t=2 p=1 | scrypt, bcrypt |
| Endpoints | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | inscription exposée |
| Portée du garde | port `Sessions` appelé par le middleware **et** par `serveImage` | un seul des deux |
| Durée | fixe, 7 jours depuis le login | glissante |
| Horloge | `Clock` d'Effect, passée en paramètre lié à la requête | `now()` de Postgres |
| Identifiant | email, index unique sur `lower(email)` | pseudo |
| Création de compte | `createUser` en domaine + cible `make user`, mot de passe sur **stdin** | seed au boot depuis `.env` |
| Recettes | communes à tous, aucun `user_id` | propriétaire anticipé |
| `/docs` (Scalar) | reste publique | protégée |
| Anti-bruteforce | **rien** — choix explicite de l'utilisateur | limite par email/IP |

### Pourquoi le cookie et pas Bearer

`RecipeCard.tsx:20` et `Detail.tsx:47` affichent les photos avec
`<img src={imageSrc(...)}>`. Un `<img>` ne peut pas porter d'en-tête
`Authorization`. Le cookie est envoyé tout seul : le front n'a rien à changer
de ce côté.

### Pourquoi le port `Sessions` est appelé deux fois — le piège principal

`server.ts:25` monte `HttpApiBuilder.serve(withImageRoute)`, et `withImageRoute`
(`image-route.ts:47-53`) intercepte l'URL **avant** de déléguer à l'API
déclarative. Un `HttpApiMiddleware` posé sur le groupe `recipes` **ne verra donc
jamais** `/recipes/:id/image` : la route des 879 photos resterait ouverte, sans
que le typage ni l'OpenAPI ne le signalent.

La vérification vit dans un port `Sessions` (domaine). Le middleware du contrat
l'appelle pour les endpoints déclarés et fournit `CurrentUser` aux handlers ;
`serveImage` l'appelle explicitement en tête. Le test « 401 sans cookie sur
`/recipes/:id/image` » est le garde-fou de cette exception — il ne doit jamais
être supprimé.

### Pourquoi l'horloge Effect et pas `now()`

Si la validité s'écrit `WHERE expires_at > now()`, c'est l'horloge de Postgres
qui décide, et le `TestClock` d'Effect ne peut pas l'avancer : « le 8e jour,
401 » devient intestable. L'heure est donc lue par `Clock.currentTimeMillis` et
passée comme paramètre lié.

## Schéma à créer

```sql
users(id, email, password_hash, created_at)
  CREATE UNIQUE INDEX ON users (lower(email))

sessions(id, user_id → users.id ON DELETE CASCADE,
         token_hash UNIQUE, expires_at, created_at)
  INDEX sur token_hash
```

Aucune des deux ne référence `recipes` : elles échappent donc au
`TRUNCATE TABLE recipes RESTART IDENTITY CASCADE` de `resetRecipes`
(`packages/db/src/index.ts:17`) que `pnpm ingest` déclenche.

Nouvelle migration Drizzle via `pnpm --filter @recettes/db generate`.
Les tests API rejouent toutes les migrations à neuf (`test/global-setup.ts`) —
rien à faire de plus de ce côté.

## Où le code atterrit

```
packages/contract   groupe auth + HttpApiSecurity.apiKey(in: cookie)
                    → l'OpenAPI et le client typé en découlent
apps/api/domain     users.ts (createUser, verify) · session.ts (port Sessions)
apps/api/infra      users-drizzle.ts · sessions-drizzle.ts · argon2.ts
apps/api/http       auth-middleware.ts (fournit CurrentUser)
                    image-route.ts  ← ajouter l'appel au port, en tête
apps/api/scripts    create-user.ts   (motif des scripts d'ingest existants)
apps/web            route /login · port AuthApi, distinct de RecipesApi
                    garde racine · bouton Déconnexion + queryClient.clear()
Makefile            cible `user` (EMAIL=..., mot de passe sur stdin)
```

**À vérifier avant d'écrire** : le mécanisme Effect visé est
`HttpApiSecurity.apiKey({ in: "cookie", key: "session" })`, un `HttpApiMiddleware`
avec `provides: CurrentUser`, et `HttpApiBuilder.securitySetCookie` au login.
Ces noms **n'ont pas été confirmés** contre `@effect/platform` 0.97.2, la version
installée. Les vérifier dans les types avant de construire dessus.

## Front

- Route `/login` avec le formulaire.
- Garde à la racine : 401 → `/login?redirect=<destination>`, puis retour à la
  destination après connexion.
- `redirect` doit être **validé comme chemin interne**, sinon redirection
  ouverte. Rappel : `validateSearch` de TanStack Router est additif et
  `src/search.ts` valide champ par champ — la clé s'y ajoute sur ce modèle.
- Bouton Déconnexion dans le header : `POST /auth/logout` **puis**
  `queryClient.clear()`. Sans conséquence aujourd'hui (les recettes sont les
  mêmes pour tous), obligatoire dès les listes de courses.
- Les 21 tests web actuels passeraient au vert sur une application cassée : leur
  faux client (`test/fake-api.ts`) ne renvoie jamais 401. Il faut l'étendre.

## Ce que les tests doivent prouver

- 401 sans cookie sur `/recipes`, `/recipes/:id` **et `/recipes/:id/image`**
- login correct → 200 + `Set-Cookie` ; mauvais mot de passe **et** email inconnu
  → 401 rigoureusement identique
- le login hache un hash factice quand l'email est inconnu (sinon le temps de
  réponse révèle quels comptes existent)
- `TestClock.adjust("6 days")` → 200, puis `"2 days"` → 401
- logout → la session disparaît, le cookie précédent ne vaut plus rien
- token forgé, token d'une session supprimée, cookie absent → 401
- un dump de `sessions` ne contient aucun token utilisable
- front : 401 → redirection, retour à la destination, `redirect` externe refusé

## Limites connues — choix explicites, à reporter dans `CLAUDE.md`

1. **Aucune limitation sur `/auth/login`.** Bourrinage lent non entravé, et
   argon2id à 19 Mo par tentative est un levier de déni de service bon marché.
2. Changer de mot de passe **n'invalide pas** les sessions ouvertes. Cumulé au
   point 1, un mot de passe compromis reste exploitable jusqu'à 7 jours.
3. Aucune purge des sessions expirées : les lignes s'accumulent.
4. **Prérequis de la feature suivante** : passer l'ingestion en
   `ON CONFLICT (book, page) DO UPDATE` **avant** d'écrire
   `shopping_list_recipes`. Sinon chaque `pnpm ingest` la vide par `CASCADE` et
   réattribue les ids — les listes pointeraient sur d'autres recettes.

## Question restée en suspens

L'utilisateur devait dire si le point 2 lui convient toujours **maintenant qu'il
est écrit à côté du point 1**. Il n'a pas répondu (fin de session). Lui poser la
question avant d'implémenter.

## Skills suggérés

- `/cns:plan` — transformer ce document en plan d'implémentation étape par étape
  avant d'écrire
- `/tdd` — les critères de test ci-dessus sont déjà écrits comme des cas rouges ;
  la feature s'y prête entièrement
- `/hono-api` — **non**, l'API est en Effect `HttpApi`, pas en Hono
- `/cns:commit` — pour commiter, une modification logique à la fois
- `/review` — en fin de branche, contre ce document

Ne pas relancer `/grill-me` : l'arbre de décision est résolu.
