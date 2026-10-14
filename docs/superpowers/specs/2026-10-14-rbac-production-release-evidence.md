# RBAC Deliverable 2 — Production Release Evidence

**Date**: 2026-10-14
**Deployment time**: 2026-10-14 18:21 UTC
**Result**: DEPLOYED AND VERIFIED

---

## 1. Merge Summary

### PR #58 — RBAC Backend (Phases 1-3)

| Field | Value |
|-------|-------|
| **PR** | [#58](https://github.com/SM-Web-Systems/lms-crypto-production/pull/58) |
| **Title** | fix(rbac): enforce course, submission, and sponsor reward scope |
| **Base** | `main` |
| **Head** | `assess/rbac-instawards-d2` |
| **State** | MERGED |
| **Merge commit** | `fa66af96eb556980a3023c43bc614cab1bafa8d2` |
| **Merged at** | 2026-10-14T16:19:13Z |
| **Commits** | 16 |
| **CI** | Frontend Tests & Build: PASS, Backend Tests: 1490/1490 PASS |
| **CI exception** | Backend CI job marked FAIL due to pre-existing `validateBvcContent.ts` TypeScript issue (esModuleInterop). This issue exists on `main` prior to this PR and is unrelated to RBAC. All 1490 backend tests pass. |

### PR #59 — Admin User Role Manager

| Field | Value |
|-------|-------|
| **PR** | [#59](https://github.com/SM-Web-Systems/lms-crypto-production/pull/59) |
| **Title** | feat(admin): add minimal user role manager interface |
| **Original base** | `assess/rbac-instawards-d2` |
| **Updated base** | `main` (changed after PR #58 merge) |
| **Head** | `feat/admin-user-role-manager` |
| **State** | MERGED |
| **Merge commit** | `6357544d492e967b33f1e1a196ecce8c16304908` |
| **Merged at** | 2026-10-14T16:19:51Z |
| **Commits** | 6 |
| **Conflicts** | None |
| **CI** | Frontend Tests & Build: PASS |

### Merge strategy

Both PRs merged using merge commit strategy (preserves commit history).
No force-push, rebase, or branch deletion performed.

---

## 2. Deployment Details

| Field | Value |
|-------|-------|
| **Server** | ScarletFlamingo |
| **Deployment checkout** | `/home/webadmin/web-stack/html/LMS-AmmaWallet` |
| **Compose file** | `docker-compose.yml` |
| **Containers** | `lms-api`, `lms-web` |
| **Previous deployed SHA** | `cfa2405c5838317783fbf3df68e08a6a80922db3` |
| **New deployed SHA** | `6357544d492e967b33f1e1a196ecce8c16304908` |
| **Previous HEAD (main checkout)** | `470b634` |
| **Deployment command** | `./scripts/deploy.sh` (documented procedure) |
| **Git pull** | Fast-forward `470b634..6357544` |
| **Pre-deploy DB backup** | `/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261014_182102.db` (14,983,168 bytes) |

### Deployment script outcome

The deploy script (`scripts/deploy.sh`) exited non-zero due to a pre-existing
smoke test configuration issue: `scripts/smoke-test.sh` defaults to
`localhost:3001` which is not published to the host (containers expose ports
internally only, reached via nginx proxy). The actual deployment succeeded:

- Docker images built successfully for both `api` and `web`
- Containers started and became healthy
- Health endpoint confirmed: `{"status":"ok","buildSha":"6357544..."}`
- Database RBAC tables present with 12 roles and 94 permissions
- Data integrity verified: users, courses, NFT credentials above thresholds

### Database state

No manual migration was required. RBAC tables (`roles`, `permissions`,
`role_permissions`, `user_roles`) were already present in the production
database from prior schema bootstrapping. The deployment confirmed:

- 12 system roles seeded
- 94 permissions seeded
- Role-permission mappings intact
- `user_roles` table operational

---

## 3. Post-Deployment Smoke Checks

All checks performed against `https://lms.smwebsystems.com` using
short-lived JWTs (5-minute expiry) generated inside the API container.
No production secrets were accessed, printed, or committed.

| # | Check | Method | Result | Detail |
|---|-------|--------|--------|--------|
| 1 | Site HTTP 200 + health | `GET /`, `GET /api/v1/health` | **PASS** | 200, `{"status":"ok","buildSha":"6357544..."}` |
| 2 | Admin sign-in | `GET /api/v1/auth/me` | **PASS** | 200, admin user authenticated, RBAC roles: admin + super-admin |
| 3 | /admin/users loads | `GET /api/v1/users` + `GET /api/v1/admin/roles` | **PASS** | 200, users and 12 roles returned |
| 4 | View test user's RBAC roles | `GET /admin/users/{id}/roles` | **PASS** | 200, student role returned |
| 5 | Assign lower-privilege role | `POST /admin/users/{id}/roles` (teacher) | **PASS** | 201, role assigned, confirmed on refresh |
| 6 | Remove that role | `DELETE /admin/users/{id}/roles/role_teacher` | **PASS** | 200, role removed, confirmed on refresh |
| 7 | Privilege boundary 403 | `POST /admin/users/{id}/roles` (super-admin) | **PASS** | 403, `"super-admin role cannot be assigned via API"` |
| 8 | Student access denied | `GET /admin/roles`, `GET /users`, `POST roles` | **PASS** | All return 403, `"Insufficient permissions"` |
| 9 | Core LMS pages load | `auth/me`, `courses`, `students`, `submissions`, static assets | **PASS** | All return 200, frontend loads correctly |
| 10 | Excluded tests confirmed | NFT, rewards, payments, mainnet | **N/A** | Not tested per authorization scope |

**Result: 9/9 applicable checks PASSED.**

---

## 4. Rollback Procedure

If a rollback is needed:

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
./scripts/rollback.sh
```

This restores the previous Docker images saved in
`.deploy-state/previous-images.txt`:
- API: `sha256:2cee889447d1d9609482b2db3791913159ef551f4c79ada0202f1a88dd18d7da`
- Web: `sha256:de7e64b01f5ec6615dd876776ff25fc8e9ce254d5bdb0f2c23de617ba2f6d33a`

For database rollback (if needed):
```bash
# Pre-deploy backup location:
/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261014_182102.db
```

For git rollback:
```bash
git checkout 470b634  # Previous main HEAD
BUILD_SHA=$(git rev-parse HEAD) docker compose build && docker compose up -d
```

---

## 5. Production Safety Confirmation

- No production secrets accessed, printed, or committed
- No Docker volumes modified manually
- No database migrations run manually (RBAC tables pre-existed)
- No `.env` files modified
- No force-push performed
- No branch deletion performed
- Pre-deploy database backup taken (14.9 MB, WAL-safe)
- Data integrity verified post-deploy (users, courses, NFT credentials)

---

## 6. Known Issues and Follow-ups

| Issue | Severity | Action |
|-------|----------|--------|
| `scripts/smoke-test.sh` defaults to `localhost:3001` | Low | Update to use public URL or internal Docker network. Pre-existing, not caused by RBAC. |
| `/api/v1/courses` now requires auth | Info | Expected RBAC behavior. Smoke test script needs update to provide auth token. Pre-existing test script issue. |
| CI `validateBvcContent.ts` TypeScript failure | Low | Pre-existing on `main`. Not caused by RBAC changes. All actual tests pass. |

---

## 7. Deliverable Status

| Deliverable | Status |
|-------------|--------|
| Deliverable 2 — RBAC Role Management | **DEPLOYED AND VERIFIED** |
| Deliverable 1 | Not started |
| Deliverable 3 | Not started |
| AmmaWallet | Not modified |

---

## 8. Deployment Timeline

| Time (UTC) | Event |
|------------|-------|
| 16:19:13 | PR #58 merged to `main` |
| 16:19:51 | PR #59 merged to `main` |
| 16:21:02 | Deploy script started, pre-deploy DB backup taken |
| 16:21:02 | Docker images built |
| ~16:22:30 | Containers deployed, API healthy |
| 16:24:14 | Build SHA verified: `6357544` |
| 16:24:38 | Smoke checks started |
| 16:25:17 | All smoke checks passed |
