# LMS-AmmaWallet

Learner management system monorepo for **SM Web Systems**, featuring **Amma Wallet** integration as the sign-in method.

This repository is separate from the original split repos (`LMS-Frontend`, `LMS-Server`, `LMS-Mobile`) and contains the full stack in one place for Amma Wallet development.

## Structure

| Directory | Description |
|-----------|-------------|
| `LMS-Server/` | Express API (SQLite, JWT auth) |
| `LMS-Frontend/` | Vite + React web app |
| `LMS-Mobile/` | Expo React Native student app |
| `docker/` | Docker/nginx config |
| `docker-compose.yml` | Full-stack local/production compose |

## Quick start

See each package README and [DEPLOY.md](./DEPLOY.md) for Docker deployment.

```bash
# API
cd LMS-Server && npm install && npm run dev

# Web
cd LMS-Frontend && npm install && npm run dev

# Mobile
cd LMS-Mobile && npm install && npm start
```
