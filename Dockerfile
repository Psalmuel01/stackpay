# Root Dockerfile: builds the StackPay web app (apps/web).
# quikdb auto-detects a Dockerfile at the repo root, so this must be the
# service you want deployed. Build context is the repo root.
#
# The API in apps/api is NOT deployed; see apps/api/Dockerfile for that.

# --- deps: install workspace dependencies from the repo root ---------------
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/integrations/package.json ./packages/integrations/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/ui/package.json ./packages/ui/package.json
# Contracts workspaces are test-only and pull heavy deps; skip them.
RUN npm ci --omit=optional --workspace @stackpay/web --include-workspace-root

# --- builder: next build with standalone output ----------------------------
FROM node:22-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:web

# --- runner: minimal image with just the standalone server -----------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# standalone bundles the server plus only the traced dependencies.
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

# quikdb runs `node index.js` from WORKDIR regardless of CMD, so give it one.
RUN printf '%s\n' "require('./apps/web/server.js');" > /app/index.js

# Next's standalone server reads PORT and HOSTNAME.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

USER node

CMD ["node", "apps/web/server.js"]
