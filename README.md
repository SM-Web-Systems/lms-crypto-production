# SM Web Systems LMS

Learning management system for the Blockchain Academy: courses, quizzes, submissions,
cohorts and sponsor reporting, with NFT certificates and learner rewards on Stellar.
Sign-in and wallets are provided by AmmaWallet, which lives in its own repository
(`amma-wallet-production`); no AmmaWallet code is kept here.

## Layout

| Folder | What it is |
|--------|------------|
| `LMS-Server/` | Express + TypeScript API on SQLite (`/api/v1`). Tests: `npm test` (vitest). |
| `LMS-Frontend/` | Vite + React web app, served by nginx in Docker. Tests: `npm test`. |
| `LMS-Mobile/` | Expo app (see `LMS-Mobile/README.md`). |
| `e2e/` | Playwright end-to-end tests against a local API and web build. |
| `docker/`, `docker-compose.yml` | Production compose stack and the edge nginx config. |
| `scripts/` | Release, preflight and inventory tooling (`scripts/deploy.sh` is the LMS deploy). |
| `docs/` | Operations, release, security and QA documentation. |

## Running locally

```bash
cd LMS-Server && cp .env.example .env && npm ci && npm run dev    # API on :3001
cd LMS-Frontend && cp .env.example .env && npm ci && npm run dev  # web on :5173
```

Deployment, health checks, environment variables and rate limits are documented in
[`DEPLOY.md`](DEPLOY.md) and `docs/operations/`.
