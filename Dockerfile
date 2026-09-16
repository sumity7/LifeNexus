# syntax=docker/dockerfile:1

# LifeOS ships as a single container: the Express API serves both /api and the
# built React SPA (see server/src/app.js). MongoDB is a separate service (see
# docker-compose.yml) — this image has no database in it.

FROM node:22-alpine AS base
WORKDIR /app

# ---- deps: install once, shared by the client build and the server runtime ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

# ---- build: compile the client SPA ----
FROM deps AS build
COPY . .
RUN npm run build -w client

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S lifeos && adduser -S lifeos -G lifeos
COPY --from=deps /app/node_modules ./node_modules
COPY server/package.json server/package.json
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
# Only meaningful with STORAGE_PROVIDER=local — mount a persistent volume here
# (see docker-compose.yml). With STORAGE_PROVIDER=s3 this directory is unused.
RUN mkdir -p /app/uploads && chown -R lifeos:lifeos /app
USER lifeos

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
