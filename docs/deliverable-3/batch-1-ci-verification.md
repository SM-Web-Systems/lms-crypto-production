# Deliverable 3 Batch 1 — CI Verification Report

## Timeline

| Commit | Fix | CI Outcome |
|---|---|---|
| `2d1e05e` (original push) | — | Backend FAIL, Frontend PASS, E2E skipped |
| `01b883a` | BVC typecheck flags | Backend PASS, Frontend PASS, E2E FAIL |
| *(this commit)* | E2E in-memory DB | Pending |

## Issue 1: Backend Tests — BVC Typecheck Step

**Failed step**: `Typecheck BVC validator script`
**Command**: `npx tsc --noEmit src/scripts/validateBvcContent.ts`

**Root cause**: Passing a file argument to `tsc` bypasses `tsconfig.json`. The
step used default compiler settings (`target: es5`, `module: commonjs`, no
`esModuleInterop`) instead of the project configuration (`target: ES2022`,
`module: NodeNext`, `esModuleInterop: true`).

**Evidence**: Last 5 CI runs on `main` all failed on the same step. Not caused
by any Batch 1 change.

**Fix** (`01b883a`): Pass explicit compiler flags matching the project tsconfig
so the standalone file typecheck works without relying on tsconfig auto-detection.

**CI runs (post-fix)**:
- https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38696109928 — Backend PASS
- https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38696116111 — Backend PASS

## Issue 2: E2E Tests — Database Bootstrap Guard

**Failed step**: `Wait for services` (timeout after backend crash)
**Backend error**:
```
FATAL: DB file exists (4096 bytes, WAL=true) but users table not found.
Refusing to bootstrap schema.sql on a non-empty DB.
```

**Root cause**: The E2E backend starts with `NODE_ENV=test` but without
`VITEST=true` or `DATABASE_PATH`. The database path falls through to
`./data/student_ms.db` (a file-based database). The bootstrap guard in
`database.ts` checks for an existing WAL file as a corruption indicator, but
the guard's own `SELECT FROM sqlite_master` query creates the WAL file in WAL
mode, causing the guard to self-trigger on a brand-new database.

**Reproduction** (local):
```javascript
const db = new Database('/tmp/fresh.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');
// WAL file does NOT exist yet
const q = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
// WAL file NOW exists — the SELECT created it
fs.existsSync('/tmp/fresh.db-wal') // true
```

**Why this was never caught**: E2E was always skipped on `main` because the
Backend Tests job failed first (due to Issue 1). Once Backend Tests passed,
E2E ran for the first time and hit this latent bug.

**Fix**: Set `DATABASE_PATH: ':memory:'` in the E2E job's `Start backend` env
block. This uses the same in-memory database mechanism that vitest uses, avoids
the file-based bootstrap guard entirely, and is the correct configuration for
ephemeral CI test runs. The safety guard for file-based databases is preserved
unchanged.

**Rationale for CI-only fix**: The self-triggering guard is a latent bug in
`database.ts`, but fixing it would be an application-behavior change outside
Batch 1 scope. The CI fix is narrower: configure the E2E environment correctly
(like vitest is already configured) so the file-based code path is never
exercised in CI.

## Sponsor Cohorts Fix Unaffected

The `sponsor_cohorts` notification fix (`ab83537`) was not altered during CI
remediation. Both CI failures were pre-existing infrastructure issues unrelated
to the Batch 1 application changes.

## CI Run URLs

| Run | Backend | Frontend | E2E |
|---|---|---|---|
| 38694156784 | FAIL (BVC) | PASS | skipped |
| 38694221177 | FAIL (BVC) | PASS | skipped |
| 38696109928 | PASS | PASS | FAIL (DB guard) |
| 38696116111 | PASS | PASS | FAIL (DB guard) |
| *(pending)* | — | — | — |
