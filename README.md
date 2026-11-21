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
| `scripts/` | Release, preflight and inventory tooling (`scripts/deploy.sh` is the LMS deploy). One-off course content scripts are in `scripts/course-content/`. |
| `ops/` | CI gate and deploy wrappers used on the server. |
| `docs/` | Current guides, phase reports and the archive (see [`docs/README.md`](docs/README.md)). |

## Running locally

```bash
cd LMS-Server && cp .env.example .env && npm ci && npm run dev    # API on :3001
cd LMS-Frontend && cp .env.example .env && npm ci && npm run dev  # web on :5173
```

Deployment, health checks, environment variables and rate limits are documented in
[`DEPLOY.md`](DEPLOY.md) and [`docs/operations/`](docs/operations/).

## Development history

A short report for each phase of development. Each one links to the detailed records in
[`docs/archive/`](docs/archive/).

1. [Security audit and manual QA](docs/phases/01-security-audit-and-qa.md): July 2026
2. [Feature build-out](docs/phases/02-feature-build-out.md): early August 2026
3. [Rewards engine, NFT minting and production migration](docs/phases/03-rewards-and-nft-minting.md): mid August 2026
4. [Workflow, SSO, production audit and hardening](docs/phases/04-workflow-sso-and-hardening.md): late August to early September 2026
5. [RBAC, grant deliverables and AUTH releases](docs/phases/05-rbac-grant-deliverables-and-auth-releases.md): October 2026
6. [Funding and reward integrity (W01–W09) and AUTH-14](docs/phases/06-funding-integrity-waves.md): late October to mid November 2026
7. [Grant Phase 2 delivery](docs/phases/07-grant-phase-2-delivery.md): November 2026
