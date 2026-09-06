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
