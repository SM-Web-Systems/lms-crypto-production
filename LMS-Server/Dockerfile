# Multi-stage build (audit 2026-11 Low #2). The build stage has the compiler toolchain and dev
# dependencies; the runtime stage gets only compiled output, production node_modules, the schema
# and the ops scripts. Both stages use the same base image, so better-sqlite3's native module
# built in the first stage runs in the second. The base is pinned by digest; Dependabot (docker)
# proposes digest updates.
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS build

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS runtime

WORKDIR /app
ARG BUILD_SHA=unknown
LABEL org.opencontainers.image.revision=$BUILD_SHA
LABEL org.smwebsystems.lms.authorization-schema=rbac-only-v1

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY database ./database
COPY scripts ./scripts
RUN echo "$BUILD_SHA" > /app/BUILD_SHA && mkdir -p data uploads

EXPOSE 3001

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# SEC-INFRA-01: Run as non-root user (AUTH-10)
# The node user (uid=1000) is provided by the base image.
# Volume directories must be owned by node for SQLite WAL/SHM and uploads.
RUN mkdir -p /home/node/.npm && \
    chown -R node:node /app/data /app/uploads /home/node
USER node

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
