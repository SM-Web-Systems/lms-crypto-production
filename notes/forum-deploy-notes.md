# Forum Soft-Delete — Deploy Notes

**Branch:** `feat/forum-soft-delete`
**Feature:** Forum topic/post soft-delete with tombstones, moderator delete, and admin audit view

---

## Migration Steps

1. **Schema migration** — `ensureForumSoftDeleteColumns()` runs automatically on app startup (in `database.ts`). Adds 4 columns each to `forum_topics` and `forum_posts` (`is_deleted`, `deleted_at`, `deleted_by`, `deletion_type`) plus 2 indexes. Idempotent — safe to run multiple times.

2. **RBAC permissions** — `seedRbacData()` adds 1 new permission automatically:
   - `forum.view_deleted` — assigned to admin, admin2, super_admin (audit view of deleted content)
   - `forum.moderate` — already exists (moderator/admin delete action)

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

- **Disable delete buttons:** Revert frontend build. Tombstone rendering is harmless (existing topics/posts have `is_deleted=0`).
- **Full rollback:** Revert to previous Docker image. Schema columns remain but are unused (all default to 0/null).
- **No data loss:** Soft-delete preserves original content in the database. Reverting does not lose any data.

---

## Monitoring Post-Deploy

1. **Error logs:** Watch `docker logs lms-api` for errors on new/updated endpoints:
   - `DELETE /forum/topics/:id` (user self-delete)
   - `DELETE /forum/posts/:id` (user self-delete)
   - `DELETE /forum/admin/topics/:id` (moderator delete)
   - `DELETE /forum/admin/posts/:id` (moderator delete)
   - `GET /forum/admin/topics` (admin audit — deleted content)
   - `GET /forum/admin/topics/:topicId/posts` (admin audit — deleted posts)

2. **Audit log growth:** Deletions create `audit_events` entries (actions: `forum_topic.deleted`, `forum_post.deleted`, `forum_topic.moderated`, `forum_post.moderated`). Monitor growth if deletion volume is high.

3. **Performance:** The `idx_forum_topics_deleted` and `idx_forum_posts_deleted` indexes cover soft-delete queries. No new slow queries expected.

4. **Tombstone cascade:** When a topic is deleted, all its posts are cascade-deleted (`deletion_type='topic_cascade'`). Monitor for large cascades if topics have many replies.

---

## Admin Training

1. **Who needs `forum.view_deleted`?** Admins and super-admins have this by default. Do NOT grant to regular users.

2. **Accessing the audit view:** Admins with `forum.view_deleted` can call `GET /forum/admin/topics` and `GET /forum/admin/topics/:topicId/posts` to see original deleted content and metadata. (No dedicated admin UI panel yet — API-only for now.)

3. **Confidentiality:** Deleted forum content may contain sensitive information. The audit view is for compliance and moderation only.

4. **Moderator actions:** Users with `forum.moderate` (instructor, admin, admin2, super_admin) can delete any user's topics or posts. Regular users can only delete their own content.

5. **Deleted User identity:** If a user's account was anonymized, the audit view recovers the original name from `deleted_user_identities`.

---

## Deploy Runbook (Step-by-Step)

### Pre-Deploy Checks

```bash
# 1. Confirm branch SHA
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git log --oneline -1 feat/forum-soft-delete
# Expected: latest commit on feat/forum-soft-delete

# 2. Confirm test status
cd LMS-Server && npx vitest run src/__tests__/forum-soft-delete.test.ts
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

1. **Create a forum topic:** Log in as a student, create a new topic with a reply.
2. **Delete own topic:** Delete your topic. Verify:
   - Tombstone appears in topic list ("[This topic was removed]").
   - Topic detail returns 404.
   - Replies cannot be added (403).
3. **Delete own reply:** Create another topic, add a reply, then delete the reply. Verify:
   - Reply appears as tombstone ("[This reply was removed]").
   - Other replies on the topic are unaffected.
4. **Moderator delete:** Log in as instructor/admin, delete another user's topic/post. Verify tombstones appear.
5. **Admin audit:** As admin with `forum.view_deleted`, call the audit endpoints. Verify original deleted content and metadata are visible.
6. **Non-admin restriction:** Verify a regular student CANNOT access admin audit endpoints (403).

```bash
# Check logs for errors on new endpoints
docker logs lms-api --since 5m 2>&1 | grep -iE 'error|ERR|fail' | head -20

# Verify health
curl -fsS https://lms.smwebsystems.com/api/v1/health | jq '.'
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

**Schema columns remain after rollback** — they are harmless (all default to 0/NULL). No need to drop columns.
