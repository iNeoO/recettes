# Une seule construction pour trois cibles : `api` (le serveur Effect, lancé
# par tsx), `ingest` (la même chose plus poppler pour extraire les images des
# PDF) et `web` (nginx qui sert la SPA construite et renvoie /api vers l'API).
# docker-compose.prod.yaml choisit la cible par service.

ARG NODE_VERSION=24-alpine
FROM node:${NODE_VERSION} AS base

ARG PNPM_VERSION=10.33.2
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# En global plutôt que par corepack, qui met pnpm en cache sous le home de
# l'utilisateur qui construit : l'exécution tourne en `node` et n'y trouverait rien.
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/ingest/package.json apps/ingest/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contract/package.json packages/contract/package.json
COPY packages/db/package.json packages/db/package.json
# Les devDependencies restent : l'API tourne par tsx et les migrations par drizzle-kit.
RUN pnpm install --frozen-lockfile

# --- api ---------------------------------------------------------------------
FROM deps AS api
ENV NODE_ENV=production
COPY apps/api apps/api
COPY apps/ingest apps/ingest
COPY packages packages
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@recettes/api", "start:prod"]

# --- ingest : l'API plus pdfimages ----------------------------------------------
FROM api AS ingest
USER root
RUN apk add --no-cache poppler-utils
USER node
CMD ["pnpm", "--filter", "@recettes/ingest", "ingest"]

# --- web : la SPA construite, servie par nginx ---------------------------------
FROM deps AS web-builder
COPY apps/web apps/web
COPY packages/contract packages/contract
RUN pnpm --filter @recettes/web build

FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
