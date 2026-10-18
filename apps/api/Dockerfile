# API image for Railway (issue #7). Build context is the repository root:
#   docker build -f apps/api/Dockerfile -t mini-market-api .
# Secrets are never baked in: every value comes from the environment of the running container.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Corepack reads `packageManager` from package.json, so the image uses the pnpm of the repository.
RUN corepack enable
WORKDIR /repo

# 1. Download every dependency from the lockfile alone: this layer is cached until it changes.
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

# 2. Install offline, build the API and the packages it uses, prune to production dependencies.
FROM fetch AS build
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter "@mini-market/api..." build
# --legacy: pnpm 10 only deploys injected workspaces by default. The target path is the final path
# (/app) so that the symlinks of node_modules stay valid in the runtime stage.
RUN pnpm deploy --legacy --filter @mini-market/api --prod /app

# 3. Runtime: production dependencies, compiled code and the SQL migrations only.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# GET /api/v1/health reports package.json's version. The deploy workflow sets GIT_SHA so a deploy
# can be told apart from the previous one: "0.0.0+<sha>" (semver build metadata).
ARG GIT_SHA=
RUN if [ -n "$GIT_SHA" ]; then npm pkg set version="0.0.0+$GIT_SHA"; fi
USER node
# Railway sets PORT; the API reads API_PORT, then PORT, then 3001.
EXPOSE 3001
CMD ["node", "dist/main.js"]
