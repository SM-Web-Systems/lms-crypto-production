# Deployment Checklist: Account Deletion & Forum Anonymization

**Feature:** Account deletion with 30-day grace period, forum anonymization, compliance access
**Branch:** `feat/account-deletion-forum-anonymization`
**Base:** `2491bd5`

---

## Pre-Deploy

- [ ] **Backup live database**
  ```bash
  # On server
  cp /app/data/student_ms.db /app/data/student_ms.db.pre-deletion-feature.bak
  ```

- [ ] **Verify no pending deploys or in-flight changes**
  ```bash
  docker compose exec api cat /app/BUILD_SHA
  curl -fsS https://lms.smwebsystems.com/api/v1/health | jq -r .buildSha
  ```

- [ ] **No feature flags required** — migrations are additive and backward-compatible. The auth gate activates only when `deletion_status` is set (NULL by default for all existing users).

---

## Deploy Steps

### 1. Merge to main
```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge --ff-only feat/account-deletion-forum-anonymization
```

### 2. Build and deploy API container
```bash
BUILD_SHA=$(git rev-parse HEAD) docker compose build --no-cache api
docker compose up -d --no-deps api
```

Migrations run automatically on startup via `ensureDeletionColumns()` and `ensureDeletionTables()`. No manual migration command needed.

### 3. Verify deployment
```bash
curl -fsS https://lms.smwebsystems.com/api/v1/health | jq -r .buildSha
# Should match the HEAD commit SHA
```

### 4. Frontend rebuild (if applicable)
```bash
# Only needed if Forum.tsx UI changes are included
docker compose build web && docker compose up -d --no-deps web
```
Note: This commit is backend-only. Frontend changes for "Deleted User" styling are deferred.

### 5. Scheduler enablement
`processExpiredDeletions()` is not yet wired to a cron/interval. Two options:

**Option A: Add to server.ts interval** (recommended for initial deploy)
```typescript
import { processExpiredDeletions } from './services/deletionService.js';
// Run daily at midnight
setInterval(() => {
  try { processExpiredDeletions(); } catch (e) { logger.error(e, 'Deletion scheduler error'); }
}, 24 * 60 * 60 * 1000);
```

**Option B: External cron** (more robust)
```bash
# Add to crontab
0 2 * * * docker compose exec api node -e "import('./src/services/deletionService.js').then(m => m.processExpiredDeletions())"
```

**Decision needed before deploy: which scheduler approach to use.**

---

## Post-Deploy Verification

### Smoke tests
- [ ] `GET /api/v1/health` returns 200 with correct buildSha
- [ ] Login works normally for existing users
- [ ] Forum topics/posts display correctly for normal users
- [ ] Browse forum as a user — topics show author names (not "Deleted User")

### Functional tests (on staging or with test user)

1. **Deletion request lifecycle:**
   - [ ] POST `/api/v1/account/delete` with `{ confirmation: "DELETE MY ACCOUNT" }` → 200
   - [ ] GET `/api/v1/account/delete/status` → shows pending with grace period
   - [ ] POST `/api/v1/account/delete/cancel` → 200, status restored
   - [ ] Admin account returns 403 on deletion attempt

2. **Auth gate (after requesting deletion):**
   - [ ] Pending user can access `/account/delete/status` and `/data-export`
   - [ ] Pending user gets 403 on `/courses`, `/forum/topics` (POST)

3. **Forum anonymization (after finalization):**
   - [ ] Create forum topic/post with test user BEFORE requesting deletion
   - [ ] Request deletion, wait for grace period (or manually trigger)
   - [ ] Verify topics/posts still visible with "Deleted User" as author
   - [ ] Verify email is null in API response
   - [ ] Verify content (title, body) is preserved

4. **Compliance access:**
   - [ ] Admin with `privacy.view_deleted_identity` permission:
     - [ ] GET `/api/v1/admin/deleted-identities/:userId` → returns original name/email
     - [ ] Check `identity_access_log` table for audit entry

5. **Legal hold:**
   - [ ] Place legal hold: POST `/api/v1/admin/users/:id/legal-hold`
   - [ ] Verify finalization is blocked
   - [ ] Release hold: DELETE `/api/v1/admin/users/:id/legal-hold`
   - [ ] Check `audit_log` for hold placement/release entries

---

## RBAC Configuration

### New permission: `privacy.view_deleted_identity`

**Recommended initial holders:**
- `super-admin` role only

**To assign:**
```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super-admin' AND p.name = 'privacy.view_deleted_identity';
```

---

## Rollback Guidance

### Safe to rollback:
- **Revert commit:** All schema additions use `IF NOT EXISTS` / `ADD COLUMN`. Reverting the code leaves the columns/tables in place but unused (all have NULL defaults).
- **Container rollback:**
  ```bash
  # Restore previous image
  docker compose up -d --no-deps api  # with previous code
  ```

### Irreversible operations:
- **`anonymizeUser()`** — once run, original PII exists only in `deleted_user_identities`. The user's name is set to "Deleted User" and email randomized. Cannot be undone without the snapshot table.
- **If rollback is needed after any finalizations have run:** The `deleted_user_identities` table preserves original data and can be used for manual restoration.

### Partially finalized state:
If the scheduler crashes mid-batch:
- `deletion_requests.status = 'finalizing'` indicates in-progress finalization
- Re-running `processExpiredDeletions()` will skip already-finalized requests (status check)
- Individual user can be manually finalized: `anonymizeUser(userId)` from deletionService
