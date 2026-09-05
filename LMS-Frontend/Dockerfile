FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_AMMA_WALLET_URL=https://ammawallet.com/
ARG BUILD_SHA=unknown
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_AMMA_WALLET_URL=$VITE_AMMA_WALLET_URL
ENV VITE_BUILD_SHA=$BUILD_SHA

RUN npm run build

FROM nginx:alpine
COPY nginx.docker.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
