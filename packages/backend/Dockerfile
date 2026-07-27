FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install dependencies first (layer cache)
COPY --chown=appuser:appgroup package*.json ./
RUN npm ci

# Copy source
COPY --chown=appuser:appgroup . .

# Remove any local .env — Docker will inject via env_file
RUN rm -f .env .env.bak

USER appuser

EXPOSE 3001

CMD ["npx", "tsx", "src/server.ts"]
