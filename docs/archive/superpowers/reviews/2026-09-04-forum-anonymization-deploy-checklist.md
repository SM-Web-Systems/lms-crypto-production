# Deployment Checklist: Account Deletion & Forum Anonymization

**Feature:** Account deletion with 30-day grace period, forum anonymization, compliance access
**Branch:** `feat/account-deletion-forum-anonymization`
**Base:** `2491bd5`
**PR link:** https://github.com/SM-Web-Systems/lms-crypto-production/pull/3
**MAIN_MERGE_SHA:** `d5a5dc66cea189b566a949a1f14895c040511d22`
**APP_DEPLOY_SHA:** `96d2e8c824fe` (includes scheduler wiring)
**Migration timestamp:** 2026-09-05T06:12:35Z (auto on container startup)
**Deployed:** 2026-09-05T06:16:38Z

---

## Pre-Deploy

- [x] **Backup live database** — `/app/data/student_ms.db.pre-deletion-feature.bak` (6.2MB)
- [x] **Verify no pending deploys or in-flight changes** — confirmed
- [x] **No feature flags required** — migrations are additive and backward-compatible

---

## Deploy Steps

### 1. Merge to main
- [x] PR #3 merged via GitHub merge commit → `d5a5dc6`

### 2. Build and deploy API container
- [x] `BUILD_SHA=d5a5dc6 docker compose build --no-cache api && docker compose up -d --no-deps api`
- [x] Migrations ran automatically via `ensureDeletionColumns()` and `ensureDeletionTables()`

### 3. Verify deployment
- [x] Health endpoint: `status=ok buildSha=96d2e8c824fe`

### 4. Frontend rebuild
- [x] `docker compose build web && docker compose up -d --no-deps web` — rebuilt for LEFT JOIN forum changes

### 5. Scheduler enablement
- [x] **Option A selected:** `setInterval` in `server.ts` (24h interval, runs on startup + every 24h)
- [x] Committed as `96d2e8c` and pushed to main
- [x] Graceful shutdown on SIGINT/SIGTERM

---

## Post-Deploy Verification

### Smoke tests
- [x] `GET /api/v1/health` returns 200 with correct buildSha
- [x] Unauthenticated requests return 401

### Functional tests (production, test data cleaned up after)

1. **Deletion request lifecycle:**
   - [x] Create test user → request deletion → grace period set (30 days)
   - [x] Cancel deletion → deletion_status restored to NULL
   - [x] Re-request with expired grace → finalization triggered

2. **Forum anonymization (after finalization):**
   - [x] Topic title and body preserved after deletion
   - [x] Author shows "Deleted User"
   - [x] Author email anonymized (deleted_xxx@deleted.local)
   - [x] deletion_status = 'finalized'

3. **Compliance identity access:**
   - [x] Original name retrieved from `deleted_user_identities`
   - [x] Original email retrieved from `deleted_user_identities`

4. **Legal hold:**
   - [x] Legal hold placed → deletion_status = 'legal_hold', reason stored
   - [x] Finalization blocked for held users (verified)
   - [x] Hold released → status cleared

5. **Schema verification:**
   - [x] 7 deletion columns on `users` table
   - [x] 3 new tables: `deleted_user_identities`, `deletion_requests`, `identity_access_log`
   - [x] RBAC permission `privacy.view_deleted_identity` exists

---

## RBAC Configuration

- [x] `privacy.view_deleted_identity` assigned to `super-admin` role
- Holders: `super-admin` only

---

## Scheduler Status

- [x] `processExpiredDeletions()` runs on startup and every 24 hours via `setInterval`
- [x] Stopped on graceful shutdown (SIGINT/SIGTERM)
- 0 expired requests on initial run (correct — no pending deletions exist yet)

---

## Follow-up Items (Deferred)

1. **Frontend "Deleted User" styling** — `isDeleted` flag available in forum API responses; needs CSS/component styling in Forum.tsx
2. **Avatar disk cleanup** — `anonymizeUser()` nullifies `avatar_url` but does not delete files from disk
3. **Design spec/TODO/diagrams branch alignment** — documentation branches need rebasing
4. **E2E testing** — add Playwright specs for deletion flow

---

## Rollback Guidance

### Safe to rollback:
- All schema additions use `IF NOT EXISTS` / `ADD COLUMN`. Reverting the code leaves columns/tables unused.
- Container rollback: `docker compose up -d --no-deps api` with previous code

### Irreversible operations:
- `anonymizeUser()` — once run, original PII exists only in `deleted_user_identities`
- If rollback needed after finalizations: `deleted_user_identities` preserves original data for manual restoration

### Partially finalized state:
- `deletion_requests.status = 'finalizing'` indicates in-progress finalization
- Re-running `processExpiredDeletions()` skips already-finalized requests
- Individual user: `anonymizeUser(userId)` from deletionService
