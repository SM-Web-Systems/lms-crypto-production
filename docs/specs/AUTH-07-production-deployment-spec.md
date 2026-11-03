# AUTH-07: Production Deployment Specification

**Date:** 2026-10-19
**Author:** Claude (automated)
**Status:** APPROVED FOR DEPLOYMENT
**Release:** AUTH-02 (sponsor billing scoping) + AUTH-03 (sponsor cohort ownership)

---

## 1. Release Overview

### What Ships

Sponsor authorization enforcement on existing API endpoints:
- **AUTH-02:** 5 payment GET endpoints scoped to sponsor's authorized cohorts
- **AUTH-03:** 12 cohort endpoints enforce sponsor ownership

### What Does NOT Ship

- No database schema changes
- No new API endpoints (middleware added to existing routes)
- No frontend changes
- No dependency changes
- No environment variable changes
- No CI/CD changes

### PRs Included

| PR | Title | Type |
|----|-------|------|
| #71 | feat(auth): scope sponsor billing access to authorized cohorts | Production + tests |
| #72 | fix(auth): sponsor cohort ownership (AUTH-03) | Production + tests |
| #73 | test(auth): preserve AUTH-04 cross-module sponsor security coverage | Tests only |
| #74 | test(e2e): add sponsor authorization E2E coverage (AUTH-06) | E2E tests only |

---

## 2. Pre-Deployment Checklist

### 2.1 Repository State

- [ ] `main` branch is checked out
- [ ] Working tree is clean (`git status` shows no changes)
- [ ] HEAD matches expected SHA: `cad179a57831543054e595a64b097dfc69754bb3`
- [ ] All CI checks pass on HEAD commit

### 2.2 Infrastructure

- [ ] Docker and Docker Compose are available
- [ ] `sudo` access for sqlite3 backup (test: `sudo sqlite3 --version`)
- [ ] Disk space ≥ 500MB available
- [ ] Production database exists at expected volume path
- [ ] Both containers (`lms-api`, `lms-web`) are currently healthy

### 2.3 Backup Verification

- [ ] Backup directory exists: `/home/webadmin/backups/lms-ammawallet-db/`
- [ ] At least one prior backup exists (confirms mechanism works)
- [ ] Backup volume has sufficient space for a new snapshot

### 2.4 Rollback Preparation

- [ ] `scripts/rollback.sh` is executable
- [ ] `.deploy-state/` directory will be created by deploy script
- [ ] Operator knows the rollback command: `scripts/rollback.sh`
- [ ] Git revert commands documented (AUTH-06 report)

---

## 3. Deployment Procedure

### 3.1 Dry Run

```bash
cd /home/webadmin/lms-crypto-production
DEPLOY_DRY_RUN=1 scripts/deploy.sh 2>&1 | tee /tmp/deploy-dry-run.log
```

**Verify:**
- All DRY RUN prefixed commands are correct
- BUILD_SHA shows the expected commit
- No ERROR or CRITICAL messages

### 3.2 Production Deployment

```bash
cd /home/webadmin/lms-crypto-production
scripts/deploy.sh 2>&1 | tee /tmp/deploy-production.log
```

**Expected flow:**
1. Pre-deploy checks pass (docker, disk space)
2. Database backup created with timestamp
3. Current image IDs saved for rollback
4. Both images rebuilt with BUILD_SHA
5. API container restarted, health check passes
6. Web container restarted
7. Smoke tests pass (5/5)
8. Data integrity verified (users≥10, courses≥3, nfts≥5)
9. Build SHA confirmed in health endpoint
10. DEPLOY SUCCESS logged

### 3.3 Post-Deploy Verification

```bash
# 1. Health endpoint
curl -s https://lms.smwebsystems.com/api/v1/health | jq .

# 2. Build SHA matches
curl -s https://lms.smwebsystems.com/api/v1/health | jq -r .buildSha
# Expected: cad179a57831543054e595a64b097dfc69754bb3

# 3. Container status
docker ps --filter name=lms --format 'table {{.Names}}\t{{.Status}}'

# 4. Smoke tests (standalone)
scripts/smoke-test.sh

# 5. Check deploy log
cat .deploy-state/deploy-log.txt
```

---

## 4. Rollback Procedure

### 4.1 Automatic Rollback

Deploy script automatically rolls back if:
- API health check fails (60s timeout)
- Smoke tests fail

### 4.2 Manual Rollback (Docker Image)

```bash
scripts/rollback.sh
```

This restores the previous Docker images and verifies API health.

### 4.3 Manual Rollback (Git Revert)

If the Docker rollback is insufficient:

```bash
# Revert AUTH-02
git revert -m 1 66f6448578ea04962bc484e1c0ec2d361203749c

# Revert AUTH-03
git revert -m 1 827f263f3672b6286203412a445b3ea618b44179

# Rebuild and deploy
git push origin main
BUILD_SHA=$(git rev-parse HEAD) docker compose build api
docker compose up -d --no-deps api
```

### 4.4 Database Restore (if needed)

Not required for this release (no schema changes). If needed:

```bash
# Find backup
cat .deploy-state/pre-deploy-backup.txt

# Stop API
docker compose stop api

# Restore (replace path with actual backup)
sudo cp /home/webadmin/backups/lms-ammawallet-db/pre-deploy_TIMESTAMP.db \
  /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db

# Restart
docker compose up -d api
```

---

## 5. Monitoring (24h Post-Deploy)

### What to Watch

| Signal | How to Check | Expected |
|--------|-------------|----------|
| API health | `curl -s .../api/v1/health \| jq .status` | `"ok"` |
| Container uptime | `docker ps --filter name=lms` | Both "Up" with "(healthy)" |
| Unexpected 403s | `docker logs lms-api 2>&1 \| grep "403"` | Only from unauthorized sponsor attempts |
| Error rate | `docker logs lms-api 2>&1 \| grep -c "ERROR"` | No increase from baseline |
| Sponsor workflows | Manual test: sponsor login → cohort list → payment list | Scoped correctly |

### Escalation

| Condition | Action |
|-----------|--------|
| API unhealthy | Run `scripts/rollback.sh` immediately |
| Widespread 403s on admin endpoints | Check if `isAdminTier()` is correctly identifying admins; rollback if affecting operations |
| Data integrity alert | Check backup file, compare row counts, investigate |
| Single sponsor reports access issue | Verify their `sponsor_user_id` matches cohort `sponsor_user_id` in DB |

---

## 6. Known Limitations

1. **Sponsor-visible 403s are expected** — Sponsors who previously had unrestricted cohort access will now be scoped to their owned cohorts. This is the intended security improvement.

2. **No frontend changes** — The frontend does not yet display sponsor-specific error messages for 403 responses. Sponsors see a generic error.

3. **COHORT-IDOR spec documented but not implemented** — Generic cohort ID guessing is documented in `COHORT-IDOR-remediation-spec.md` for future implementation.

4. **Admin dual-discriminator** — `isAdminTier()` uses `course.delete` as the discriminator permission. This works correctly but is not the ideal long-term pattern (see SEC-01 in AUTH-06 findings).

---

## 7. Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Deploy completes without error | `deploy.sh` exits 0, DEPLOY SUCCESS in log |
| Build SHA matches | Health endpoint returns expected SHA |
| All smoke tests pass | `smoke-test.sh` exits 0 (5/5) |
| Data integrity preserved | Row counts above thresholds |
| No regression in admin access | Admin can access all cohorts and payments |
| Sponsor scoping enforced | Sponsor A cannot see Sponsor B's cohorts/payments |
| No unexpected errors in 24h | Error rate stable compared to pre-deploy baseline |
