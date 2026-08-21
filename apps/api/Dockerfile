# Build context MUST be the repo root:
#   docker build -f apps/api/Dockerfile -t stackpay-api .
# apps/api/src/server.js imports ../../../packages/{config,domain,integrations},
# so those must be present inside the image alongside the app.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# The API has no runtime npm dependencies (node:http + local packages only),
# so no install step is needed. Copy just what the entrypoint reaches.
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/src ./apps/api/src
COPY packages/config/src ./packages/config/src
COPY packages/domain/src ./packages/domain/src
COPY packages/integrations/src ./packages/integrations/src

USER node

ENV STACKPAY_API_PORT=4000
EXPOSE 4000

CMD ["node", "apps/api/src/index.js"]
