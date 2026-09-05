# Push and PR Commands

## Push feature branch
```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
source ~/.env.git-write
git push -u "https://${GH_TOKEN}@github.com/SM-Web-Systems/lms-crypto-production.git" feat/account-deletion-forum-anonymization
```

## Create PR
```bash
source ~/.env.git-write
export GITHUB_TOKEN="$GH_TOKEN"
gh pr create \
  --repo SM-Web-Systems/lms-crypto-production \
  --base main \
  --head feat/account-deletion-forum-anonymization \
  --title "feat: account deletion with forum anonymization" \
  --body "$(cat <<'PREOF'
## Summary

- Add account deletion system with 30-day grace period and user self-service
- Preserve forum content after deletion: topics/posts remain with "Deleted User" author
- Implement compliance identity access with RBAC gating and audit logging
- Add legal hold mechanism to block deletions during disputes/investigations

## Changes (14 files, +2060/-31)

### Schema & Infrastructure
- 7 new columns on `users` table (deletion_status, legal_hold, timestamps)
- 3 new tables: `deleted_user_identities`, `deletion_requests`, `identity_access_log`
- 1 new RBAC permission: `privacy.view_deleted_identity`

### Backend
- `deletionService.ts` — identity snapshot, anonymization, lifecycle, finalization, legal hold
- `accountDeletion.ts` — user-facing routes (request, cancel, status)
- `adminDeletion.ts` — admin routes (legal hold, compliance identity access)
- `auth.ts` — deletion status gate (finalized=blocked, pending=restricted)
- `forumController.ts` — INNER JOIN → LEFT JOIN, deleted user anonymization
- `dataExportService.ts` — forum topics/posts added to data export

### New API Endpoints
| Method | Path | Auth |
|--------|------|------|
| POST | /account/delete | User |
| POST | /account/delete/cancel | User |
| GET | /account/delete/status | User |
| POST | /admin/users/:id/legal-hold | Admin (user.delete) |
| DELETE | /admin/users/:id/legal-hold | Admin (user.delete) |
| GET | /admin/deleted-identities/:id | Admin (privacy.view_deleted_identity) |

## Security & Privacy

- Finalized users fully blocked from all authenticated endpoints
- Pending-deletion users restricted to deletion management + data export only
- Forum queries use LEFT JOIN; deleted users show "Deleted User" name, null email
- Original PII stored in restricted `deleted_user_identities` table with 7-year retention
- All compliance identity access logged with actor, target, reason, timestamp
- Legal hold placement/release audited via `audit_log`
- No secrets or credentials in diff

## Migration Notes

- All migrations are **additive and idempotent** (ALTER TABLE ADD COLUMN, CREATE TABLE IF NOT EXISTS)
- No destructive operations on existing data
- No feature flags needed — auth gate only activates when deletion_status is non-NULL
- Existing users are unaffected (all new columns default to NULL)

## RBAC

New permission `privacy.view_deleted_identity` must be assigned to `super-admin` role:
```sql
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super-admin' AND p.name = 'privacy.view_deleted_identity';
```

## Scheduler

`processExpiredDeletions()` needs to be wired to a daily cron/interval for automatic finalization after grace periods expire. Not yet configured — requires a follow-up decision on approach (setInterval in server.ts vs. external cron).

## Tests

42 new tests (1312 total, all passing):
- Schema verification (8)
- Deletion lifecycle (8)
- Auth gate (5)
- Anonymization (6)
- Finalization scheduler (3)
- Forum anonymization (6)
- Data export (1)
- Compliance access (3)
- Legal hold with audit (2)

TypeScript strict: clean.

## References

- [Design Spec](docs/superpowers/specs/2026-09-04-forum-anonymization-design.md)
- [PR Review](docs/superpowers/reviews/2026-09-04-forum-anonymization-pr-review.md)
- [Deploy Checklist](docs/superpowers/reviews/2026-09-04-forum-anonymization-deploy-checklist.md)

## Test Plan

- [ ] All 1312 tests pass
- [ ] TypeScript strict passes
- [ ] Manual smoke test: login, browse forum, verify no regression
- [ ] Test deletion flow with disposable test account
- [ ] Verify compliance access requires RBAC permission
- [ ] Verify legal hold blocks finalization

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PREOF
)"
```
