# Stage 1: Install production dependencies only
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Production image
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy only what's needed at runtime
COPY --chown=appuser:appgroup package*.json ./
COPY --chown=appuser:appgroup src/ ./src/

# Remove any local .env — Docker will inject via env_file
RUN rm -f .env .env.bak

USER appuser

EXPOSE 3001

CMD ["npx", "tsx", "src/server.ts"]
