# ─── API Dockerfile (multi-stage, monorepo-aware) ───
#
# Build context: REPO ROOT (nu apps/api/)
# Railway: dockerfilePath = "apps/api/Dockerfile"

# ── Stage 1: Build ──────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# 1. Copiază package files (root + api + shared) pentru install
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# 2. Install toate dependențele (inclusiv devDependencies pt build)
RUN npm ci

# 3. Copiază source-ul
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# 4. Build shared + api
RUN cd packages/shared && npx tsc
RUN cd apps/api && npx tsc

# ── Stage 2: Production ────────────────────────────────
FROM node:20-slim AS runner

# Python pentru procesare documente (PyMuPDF, python-docx, openpyxl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip && \
    pip3 install --break-system-packages PyMuPDF python-docx openpyxl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Copiază package files pentru production install
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# 2. Install doar producție
RUN npm ci --omit=dev

# 3. Copiază codul compilat
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared ./packages/shared

# 4. Copiază drizzle migrations + meta (pentru auto-migrate la startup)
COPY apps/api/src/db/migrations ./apps/api/src/db/migrations
COPY apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts

ENV NODE_ENV=production
EXPOSE 8080

WORKDIR /app/apps/api

# Run migrations first (with timeout), then start server.
# Migrations are idempotent and fast (< 10s). Running sequentially ensures
# the DB schema is ready before routes try to query.
# If migrations fail, server still starts so health check works and setup-db can retry.
CMD ["sh", "-c", "timeout 30 node dist/db/migrate.js || echo '[WARN] Migration failed, server starting anyway...'; exec node dist/index.js"]
