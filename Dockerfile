# Multi-stage build for sift, per vault-sift/features/DISTRIBUTION-TRUST/DISTRIBUTION-TRUST--oss-packaging.md.
#
# node:22-slim, not node:22-alpine: better-sqlite3 is a native module compiled
# via node-gyp at install time, and alpine's musl libc is a well-known source
# of native-module compilation pain (prebuilt binaries rarely target musl,
# forcing an in-image from-source compile that can fail outright). slim keeps
# the glibc toolchain at a modest image-size cost — worth it for an image that
# has to build reliably on strangers' machines, not just the author's own.

FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Standalone's server.js defaults to binding localhost only, which is
# unreachable from outside the container despite the port mapping.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN useradd --system --create-home sift \
    && mkdir -p /app/data /app/config \
    && chown -R sift:sift /app/data /app/config

COPY --from=build --chown=sift:sift /app/.next/standalone ./
COPY --from=build --chown=sift:sift /app/.next/static ./.next/static
# drizzle/ is read via a raw file path at runtime (drizzle-orm's migrator),
# not imported — Next's standalone output tracing only follows JS imports,
# so this folder is never included automatically and must be copied by hand.
COPY --from=build --chown=sift:sift /app/drizzle ./drizzle
# Same reasoning as drizzle/ above: lib/translation/dist/worker.js is
# loaded at runtime via `new Worker(path)` (lib/translation/translate.ts),
# a raw path string, not a JS import — standalone tracing has been
# observed to sometimes pick this up via its dynamic-require heuristics,
# but that isn't a guarantee to build a production image on, so it's
# copied explicitly here too. Built by `npm run build:worker`, which
# `npm run build` already runs as its `prebuild` step.
COPY --from=build --chown=sift:sift /app/lib/translation/dist ./lib/translation/dist

USER sift
EXPOSE 3000
CMD ["node", "server.js"]
