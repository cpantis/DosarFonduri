# ─── Web Dockerfile (multi-stage, monorepo-aware) ───
#
# Build context: REPO ROOT (nu apps/web/)
# Railway: dockerfilePath = "apps/web/Dockerfile"

# ── Stage 1: Build ──────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# 1. Copiază package files (root + web + shared)
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# 2. Install dependențe (inclusiv dev pt build)
RUN npm ci

# 3. Copiază source
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# 4. Build Next.js (output: standalone)
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=https://api-production-8bd3.up.railway.app
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN cd apps/web && npm run build

# ── Stage 2: Production ────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Copiază standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
