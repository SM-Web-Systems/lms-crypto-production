# Deployment Readiness Note

**Date:** 2026-09-05
**Current Main SHA:** 4ebf054
**Deployed SHA:** f63124cf

## Deployment Gap

20 commits, 20 files changed (+1887/-43 lines). The gap contains:

- **Documentation** (14 files): operations baseline, improvement plan, session summary, handover note, E2E coverage plan, performance baseline, deployment record template, release checklist, branch workflow, branch retirement checklist, production handover, README.
- **Tests** (2 files): payment edge cases (10 unit tests), E2E payment flow skeleton (8 skipped scenarios).
- **Scripts** (2 files): BVC content validator, bundle size measurement.
- **CI config** (2 files): Dependabot config, npm audit step in CI workflow.
- **Removed** (1 file): stale `docs/DEPLOYMENT.md` (AmmaWallet content in LMS repo).

**No application source code, Docker, Compose, or production configuration changes.**

## Risk Assessment

**Risk Level:** Low

- No application logic changes.
- No database migrations.
- No container configuration changes.
- All 1328 backend tests pass.
- BVC validator smoke test: 0 errors, 0 warnings.
- Only `package.json` change: added `validate:bvc` script entry (no dependency changes).

## Changed File Summary

| Category | Files |
|----------|-------|
| Docs (operations) | 10 new Markdown files in `docs/operations/` |
| Docs (other) | `DEPLOY.md` updated, `docs/DEPLOYMENT.md` deleted, `production-audit/README.md` added |
| Tests | `payment-edge-cases.test.ts`, `payment-flow.spec.ts` |
| Scripts | `validateBvcContent.ts`, `measure-bundle-sizes.sh` |
| CI | `.github/dependabot.yml`, `.github/workflows/ci.yml` |
| Config | `LMS-Server/package.json` (+1 script line) |

## Recommended Deployment Steps

When approved:

1. `BUILD_SHA=$(git rev-parse HEAD) docker compose build --no-cache api`
2. `docker compose up -d --no-deps api`
3. Verify: `curl -fsS https://lms.smwebsystems.com/api/v1/health | jq -r .buildSha`
4. Expected buildSha: first 7 chars of 4ebf054.
5. `docker compose build web && docker compose up -d --no-deps web`
6. Verify frontend loads correctly.
7. Run BVC validator: `docker exec lms-api npm run validate:bvc -- --skip-reachability`

## Approval Required

Deployment requires explicit separate approval before execution.
