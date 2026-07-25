FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Remove any local .env — Docker will inject via env_file
RUN rm -f .env .env.bak

EXPOSE 3001

CMD ["npx", "tsx", "src/server.ts"]
