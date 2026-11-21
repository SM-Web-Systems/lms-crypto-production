# Current Production Handover

Last updated: 2026-09-05

## Repository State

| Item | Value |
|------|-------|
| Repository | SM-Web-Systems/lms-crypto-production |
| Main SHA | `f63124cfb5bf2ee952029af4bf9f394dd1f34c15` |
| Local branches | `main` only |
| Remote branches | `origin/main` only |
| Active feature branches | None |

## Deployed State

| Item | Value |
|------|-------|
| API build SHA | `f63124cfb5bf2ee952029af4bf9f394dd1f34c15` |
| Web build SHA | `f63124cfb5bf2ee952029af4bf9f394dd1f34c15` |
| API health status | ok |
| API container | `lms-api` (service: `api`) |
| Web container | `lms-web` (service: `web`) |
| API Compose image | `lms-ammawallet-api` |
| Web Compose image | `lms-ammawallet-web` |

## BVC Course

| Item | Value |
|------|-------|
| Course ID | `bvc-2026-0000-0000-000000000001` |
| Weeks | 2 |
| Sections | 7 |
| Items | 56 |
| Module quizzes | 7 |
| Final quiz ID | `bvc-quiz-0000-0000-000000000001` |
| Final quiz threshold | 70% |
| Media | YouTube-primary video/audio |
| Downloads | GitHub media downloads |
| Lessons | Native Markdown lessons and study guides |
| Flashcards | Native flashcard decks |
| Mind maps | Native mind maps |

## Recent Milestones

| Date | Event | Tag/SHA |
|------|-------|---------|
| 2026-09-05 | Build-SHA traceability merged and deployed (PR #6) | `f63124c` |
| 2026-09-05 | Account deletion follow-up deployed (PR #4) | `account-deletion-followup-2026-09-05` |
| 2026-09-05 | Account deletion with forum anonymization deployed (PR #3) | `d5a5dc6` |
| 2026-09-03 | Production audit closed | `audit-closure-2026-09-03` |
| 2026-09-03 | Rate-limit incident closed | `rate-limit-closure-2026-09-03` |

## Operational Notes

- Application build SHA, content SHA, and migration SHA must be recorded separately (see `DEPLOYMENT_RECORD_TEMPLATE.md`).
- Account-deletion changes require privacy/security review and dry-run-first data handling.
- RBAC is always on (no feature flag).
- NFT auto-mint is disabled (`NFT_AUTO_MINT_ENABLED=false`); minting is admin-triggered only.
- Express 4 async handler gotcha: synchronous better-sqlite3 calls in async handlers silently swallow errors. Use sync handlers for routes that only call better-sqlite3.
- Frontend must be built inside Docker (`VITE_API_BASE_URL=/api/v1` is a Dockerfile ARG). Local builds break browser API calls.
- Deploy with: `BUILD_SHA="$(git rev-parse HEAD)" docker compose build --no-cache api web && docker compose up -d --no-deps api web`.
- Verify with: `curl -fsS https://lms.smwebsystems.com/api/v1/health | jq '{status, buildSha}'`.
