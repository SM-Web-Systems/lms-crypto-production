# Incident: LMS Production DB Reset — 2026-09-07

**Status:** RESOLVED
**Severity:** HIGH (data loss — all courses, NFTs, user profiles)
**Root cause:** DB effectively reset during Sep 6 deploy of PR #39 (DM soft-delete, SHA `3cfb1faa`)

## Timeline

- **Sep 5 06:10 UTC** — Pre-deletion backup created (`student_ms.db.pre-deletion-feature.bak`, 5.9MB)
- **Sep 6 13:21 UTC** — `lms-api` container rebuilt for PR #39 deploy
- **Sep 6 13:22 UTC** — First new user created (smoke-test account) — DB was fresh at this point
- **Sep 7 06:58 UTC** — Admin (mukhtar.meer) re-registered via SSO on the empty DB
- **Sep 7 ~07:40 UTC** — Incident detected: 0 courses, 0 NFTs, user reports data loss

## Before-State (Current Empty DB)

| Table | Count |
|-------|-------|
| users | 5 (3 smoke-test, 2 re-registrations) |
| courses | 0 |
| nft_credentials | 0 |
| lesson_completions | 0 |
| forum_topics | 1 (test topic created Sep 7) |
| forum_posts | 0 |
| conversation_messages | 2 |
| conversations | 4 |

## Backup Target (Sep 5 pre-deletion-feature.bak)

| Table | Count |
|-------|-------|
| users | 13 |
| courses | 4 |
| nft_credentials | 10 |
| lesson_completions | 47 |
| forum_topics | 1 |
| forum_posts | 2 |
| conversation_messages | 10 |
| conversations | 4 |

## Restore Plan

1. Safety backup created: `student_ms.db.empty-20260907-pre-restore` (6.3MB)
2. Stop `lms-api` container
3. Copy `student_ms.db.pre-deletion-feature.bak` → `student_ms.db`
4. Remove stale WAL/SHM files
5. Restart `lms-api` — migrations will run on startup
6. Verify row counts, health, and API functionality

## Post-Restore Notes

**Restore completed: 2026-09-07 07:46 UTC**

### Restore steps executed

1. Created safety backup: `student_ms.db.empty-20260907-pre-restore` (6.3MB)
2. Stopped `lms-api` container
3. Removed stale WAL/SHM files from empty DB
4. Copied `student_ms.db.pre-deletion-feature.bak` → `student_ms.db`
5. Restarted `lms-api` — clean startup, no migration errors
6. Verified all data restored

### Post-Restore Row Counts (Verified)

| Table | Before (empty) | After (restored) | Expected | Match |
|-------|----------------|-------------------|----------|-------|
| users | 5 | 13 | 13 | YES |
| courses | 0 | 4 | 4 | YES |
| nft_credentials | 0 | 10 | 10 | YES |
| lesson_completions | 0 | 47 | 47 | YES |
| forum_topics | 1 | 1 | 1 | YES |
| forum_posts | 0 | 2 | 2 | YES |
| conversation_messages | 2 | 10 | 10 | YES |
| user_roles | 5 | 14 | 14 | YES |
| permissions | 93 | 93 | 93 | YES |
| quizzes | - | 11 | 11 | YES |

### Admin Account

- **Original account restored:** mukhtar.meer@smwebsystems.com (created 2026-07-10)
- **Roles:** admin + super-admin
- **Permissions:** 93 (full access)
- **No duplicate accounts** — the re-registered account from Sep 7 was on the now-archived empty DB

### Migration State

- **DM soft-delete (PR #39):** Columns present (`conversation_messages.is_deleted`, `deleted_at`, `deleted_by`, `deletion_type`). DM permissions (`message.delete_own`, `message.delete_any`, `message.view_deleted`) present. Applied before Sep 5 backup.
- **Account deletion:** Tables present (`deleted_user_identities`, `deletion_requests`, `data_exports`). Applied before Sep 5 backup.
- **Forum soft-delete (PR #40):** APPLIED — PR #40 merged (`c8052db`) and deployed 2026-09-07 08:10 UTC. All columns present, RBAC seeded (94 permissions). Smoke tests PASS.

### System Health

- Health endpoint: 200 OK, DB latency 0ms
- Build SHA: `3cfb1faa` (PR #39 merge)
- Frontend: 200 OK
- Both containers healthy
- No errors in startup logs

### Courses Restored

1. PILOT-2026-01 — LMS Pilot: Blockchain Fundamentals
2. BVC-2026 — Blockchain Vibe Coding
3. SVC-2026 — Stellar Vibe Coding
4. QA-P3-2026 — Phase 3 QA Test Course

### NFTs Restored

- 10 NFT credentials, all status `minted`

## Follow-Up Tasks

1. **User re-authentication:** Users who re-registered on the empty DB (mukhtar.meer, isthattehcat) will need to log in via SSO again. Their original accounts (from backup) will be matched by email.
2. **Backup policy review:** The LMS backup cron (`/home/webadmin/backups/lms-db/`) only has Aug 19-20 backups. The daily cron appears to have stopped or is not backing up from the Docker volume. **This must be fixed.**
3. **Root cause hardening:** Investigate why `docker compose build --no-cache api` on Sep 6 caused the DB to reset. Likely the WAL wasn't checkpointed, or the init code re-created tables on a transient file state.
4. **Deploy procedure update:** Future deploys should include a pre-deploy DB backup step as a mandatory gate.
