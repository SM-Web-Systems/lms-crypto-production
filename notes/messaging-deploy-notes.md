# DM Soft-Delete — Deploy Notes

**Branch:** `feat/messaging-dm-soft-delete`
**Feature:** DM soft-delete with tombstone + admin audit UI

---

## Migration Steps

1. **Schema migration** — `ensureMessageSoftDeleteColumns()` runs automatically on app startup (in `database.ts`). Adds 4 columns + 1 index to `conversation_messages`. Idempotent — safe to run multiple times.

2. **RBAC permissions** — `seedRbacData()` adds 3 new permissions automatically:
   - `message.delete_own` — assigned to all user roles
   - `message.delete_any` — assigned to admin, admin2, super_admin
   - `message.view_deleted` — assigned to admin, admin2, super_admin

3. **No manual SQL required.** All migrations are code-driven.

---

## Deploy Command

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
BUILD_SHA=$(git rev-parse HEAD) docker compose build --no-cache api web
docker compose up -d --no-deps api web
```

---

## Rollback Plan

**Low risk — feature is additive:**

- **Disable delete button:** Revert frontend build. Tombstone rendering is harmless (existing messages have `is_deleted=0`).
- **Full rollback:** Revert to previous Docker image. Schema columns remain but are unused (all default to 0/null).
- **No data loss:** Soft-delete preserves original message bodies. Reverting does not lose any data.

---

## Monitoring Post-Deploy

1. **Error logs:** Watch `docker logs lms-api` for errors on new endpoints:
   - `DELETE /messages/messages/:messageId`
   - `GET /messages/admin/conversations`
   - `GET /messages/admin/conversations/:id/messages`
   - `GET /messages/admin/messages/:id`

2. **Audit log growth:** Deletions create `audit_log` entries (action: `message.deleted`, `message.admin_deleted`). Monitor growth if deletion volume is high.

3. **Performance:** The admin conversations list uses `GROUP BY` with `LEFT JOIN`. If the conversations table grows large (>10k rows), consider adding pagination.

4. **No new slow queries expected** — `idx_messages_deleted` index covers the `is_deleted` column.

---

## Admin Training

1. **Who needs `message.view_deleted`?** Admins and super-admins have this by default. Do NOT grant to regular users.

2. **Accessing the audit UI:** Admin Dashboard → scroll to "Message audit" panel.

3. **Confidentiality:** Deleted messages may contain sensitive content. The audit view is for compliance and moderation only. No export functionality is provided.

4. **Deleted User identity:** If a user's account was anonymized, the audit view shows "Deleted User" with the original name (recovered from `deleted_user_identities`).

---

## Deploy Runbook (Step-by-Step)

### Pre-Deploy Checks

```bash
# 1. Confirm branch SHA
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git log --oneline -1 feat/messaging-dm-soft-delete
# Expected: da0b94d (or latest after PR merge)

# 2. Confirm test status
cd LMS-Server && npx vitest run src/__tests__/message-soft-delete.test.ts
# Expected: 38/38 pass

# 3. Confirm frontend build
cd ../LMS-Frontend && npx tsc --noEmit && npx vite build
# Expected: 0 errors, build successful

# 4. Verify DB backup exists (LMS daily backup cron at 03:00 UTC)
ls -la /home/webadmin/backups/lms-db/ | tail -3
```

### Deploy Steps

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet

# 1. Merge PR (after approval) — or pull merged main
git checkout main
git pull origin main

# 2. Verify merge
git log --oneline -1
# Should show merge commit or latest feature commit

# 3. Build and deploy (BOTH api and web containers)
BUILD_SHA=$(git rev-parse HEAD) docker compose build --no-cache api web
docker compose up -d --no-deps api web

# 4. Verify containers started
docker ps | grep -E 'lms-api|lms-web'
# Both should show "Up" status

# 5. Check API health
curl -fsS https://lms.smwebsystems.com/api/v1/health | jq '.buildSha'
# Should match the deployed commit SHA
```

### Post-Deploy Smoke Tests

1. **Send a DM:** Log in as a student, send a message to another user. Verify delivery.
2. **Delete a DM:** Delete your own message. Verify tombstone appears ("This message was deleted").
3. **Verify tombstone for recipient:** Log in as the other user. Verify tombstone is visible in the conversation.
4. **Admin audit:** Log in as admin (mukhtar.meer@smwebsystems.com via SSO). Open Admin Dashboard → scroll to "Message audit" panel. Verify deleted message content and metadata are visible.
5. **Non-admin restriction:** Verify a regular student CANNOT access admin audit endpoints.

```bash
# Check logs for errors on new endpoints
docker logs lms-api --since 5m 2>&1 | grep -iE 'error|ERR|fail' | head -20

# Verify audit log entries
docker exec lms-api node -e "
  const db = require('/app/src/config/database.js');
  const rows = db.query('SELECT * FROM audit_log WHERE action LIKE ? ORDER BY created_at DESC LIMIT 5', ['message.%']);
  console.log(JSON.stringify(rows, null, 2));
"
```

### Rollback Steps (If Needed)

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet

# 1. Revert to previous commit
git checkout <previous-sha>  # e.g. the commit before merge

# 2. Rebuild and redeploy
BUILD_SHA=$(git rev-parse HEAD) docker compose build --no-cache api web
docker compose up -d --no-deps api web

# 3. Verify rollback
curl -fsS https://lms.smwebsystems.com/api/v1/health | jq '.buildSha'
```

**Schema columns remain after rollback** — they are harmless (all default to 0/NULL). No need to drop columns. If desired, run manually:
```sql
-- Optional cleanup (NOT required for rollback):
-- ALTER TABLE conversation_messages DROP COLUMN is_deleted;
-- etc.
```
