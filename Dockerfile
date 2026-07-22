FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies for native modules.
# Debian (glibc) rather than Alpine (musl): sqlite-vec's prebuilt Linux binaries are
# built against glibc and fail to load under musl — see DECISIONS.md.
# Cairo/Pango/JPEG/GIF/RSVG dev libs: required by the `canvas` package (document-import PDF
# image extraction) — node-canvas ships prebuilt binaries for some platforms, but this slim base
# image has none of its native deps present, so it needs to be able to build from source too.
# libgomp1: onnxruntime-node's prebuilt native binary (used by the local in-process embedding
# backend, @huggingface/transformers) links against OpenMP, which Debian-slim doesn't include by
# default — see docs/Local_Embeddings_Design.md.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ libgomp1 \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Fail the build immediately if sqlite-vec can't load in this environment (e.g. a glibc/musl
# mismatch), rather than deferring the failure to the first RAG request at runtime.
RUN node server/scripts/verify-sqlite-vec.mjs

# Download the local in-process embedding model's weights once here (the one deliberate network
# fetch, build-time only) and prove the cache is actually usable — both fail the build loudly
# rather than surfacing as a runtime 500 the first time someone enables this backend.
RUN node server/scripts/prefetchEmbeddingModel.mjs
RUN node server/scripts/verify-local-embeddings.mjs

# Build application (frontend + backend)
RUN npm run build

# Sanity check
RUN test -f /app/dist/server/server/index.js || (echo "Build output missing" && exit 1)

# Production stage
FROM node:22-slim

WORKDIR /app

# Install build dependencies for native modules (needed for better-sqlite3 and canvas), wget for
# the docker-compose healthcheck (not included by default on Debian, unlike Alpine), and libgomp1
# for onnxruntime-node (local in-process embeddings — see docs/Local_Embeddings_Design.md).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ wget libgomp1 \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/db/migrations ./dist/server/server/db/migrations
COPY --from=builder /app/server/data ./dist/server/server/data

# Baked local embedding model cache (see docs/Local_Embeddings_Design.md) — copied as-is from the
# builder stage's one deliberate network fetch; this stage's runtime code points at the same
# directory with allowRemoteModels=false, so no network access is needed from here on.
COPY --from=builder /app/.embedding-model-cache ./.embedding-model-cache

# Verification scripts (plain .mjs, no build step needed)
COPY server/scripts ./server/scripts

# Re-verify sqlite-vec against this stage's own --omit=dev install of the platform binary
# (the builder stage already checked it once, but this is a separate `npm ci` and the image
# that actually ships, so it gets checked again here).
RUN node server/scripts/verify-sqlite-vec.mjs

# Verify the full migration chain — including the RAG virtual tables — applies cleanly
# using the exact compiled artifacts and migration files that ship in this image.
RUN node server/scripts/verify-migrations.mjs

# Re-verify the local embedding backend against this stage's own --omit=dev install and the
# copied-across model cache (same "check it again in the image that actually ships" reasoning
# as the sqlite-vec re-check above).
RUN node server/scripts/verify-local-embeddings.mjs

# Create data directory for SQLite with correct ownership
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

# Volume validation entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint && chmod +x /usr/local/bin/entrypoint

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/storynexus.db

# User set via docker-compose (PUID/PGID env vars, defaults to 1000:1000)
ENTRYPOINT ["entrypoint"]
CMD ["node", "dist/server/server/index.js"]
