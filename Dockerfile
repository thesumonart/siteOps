# One image, two entrypoints.
#
# The API and the worker share every dependency and both are plain Node
# processes over the same workspace, so building them separately would double
# the build time and the registry storage to produce two nearly identical
# images. Which one runs is decided at start time by the command.
#
#   docker build -t siteops .
#   docker run siteops node apps/api/dist/main.js
#   docker run siteops node apps/worker/dist/main.js
#
# The web app is not built here — it deploys to Vercel; see docs/DEPLOYMENT.md.

# Pinned to the same version as .nvmrc. Alpine keeps the image small; the only
# native dependency in these trees is the MongoDB driver, which ships prebuilt.
FROM node:24.15.0-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- Dependencies -----------------------------------------------------------
# Manifests are copied on their own so this layer is reused whenever only
# source has changed, which is almost every build.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
# Filtered to the two services and what they depend on. Every workspace
# manifest is copied above so the lockfile still resolves, but installing all
# of them would pull the web app's tree — Next, SWC, Playwright — into an
# image that never runs it, which is most of the image size for nothing.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
      --filter @siteops/api... --filter @siteops/worker...

# ---- Build ------------------------------------------------------------------
FROM deps AS build
COPY . .

# Built in explicit dependency order rather than through a filter.
#
# `pnpm --filter pkg...` selects the right packages but does not sequence them,
# so `@siteops/database` can start compiling before `@siteops/shared` has
# emitted its declarations. Turbo does order them, but resolving that graph
# needs repository context this image deliberately does not carry. Four lines of
# explicit order is the honest version of what `dependsOn: ["^build"]` means.
#
# `@siteops/config` is absent because it ships its configs as source and has no
# build step; the web app is absent because it deploys to Vercel.
RUN pnpm --filter @siteops/shared build \
    && pnpm --filter @siteops/database build \
    && pnpm --filter @siteops/api build \
    && pnpm --filter @siteops/worker build

# `pnpm deploy` produces a self-contained directory per service: the built
# package plus only the production dependencies it actually requires, with
# workspace packages materialised rather than symlinked out of the repository.
#
# A `--prod` reinstall is not enough on its own. pnpm's virtual store is shared
# across the workspace, so it stays hydrated with everything the lockfile
# mentions — the web app's Next, SWC and Playwright included — even when only
# the two services are linked. Deploying is what actually leaves them behind.
RUN pnpm --config.inject-workspace-packages=true --filter=@siteops/api deploy --prod --ignore-scripts /deploy/api \
    && pnpm --config.inject-workspace-packages=true --filter=@siteops/worker deploy --prod --ignore-scripts /deploy/worker

# ---- Runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# `node` exists in the base image with uid 1000. Running as root would let a
# process compromised through a dependency write to its own code.
COPY --from=build --chown=node:node /deploy/api ./apps/api
COPY --from=build --chown=node:node /deploy/worker ./apps/worker

USER node

# Overridden per service. Neither process is wrapped in a shell, so it receives
# SIGTERM directly and its own graceful-shutdown path runs.
CMD ["node", "apps/api/dist/main.js"]
