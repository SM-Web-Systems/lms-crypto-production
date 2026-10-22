FROM node:22-bookworm-slim

RUN apt-get update && \
    apt-get install -y python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG BUILD_SHA=unknown
COPY . .
RUN echo "$BUILD_SHA" > /app/BUILD_SHA
RUN npm run build

RUN mkdir -p data uploads

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
