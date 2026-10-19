# AUTH-08: Post-Deployment Assessment Prompt

**Date:** 2026-10-19
**Scope:** Independent audit of AUTH-07 production deployment
**Assessor:** Claude (automated)

---

## Purpose

Systematically verify the AUTH-07 production deployment, audit all deployment-time modifications, and confirm repository synchronization readiness.

## Files Under Assessment

| File | Purpose |
|------|---------|
| `docs/release/AUTH-07-production-deployment-report.md` | Deployment record |
| `docs/release/AUTH-07-task-checklist.md` | Phase tracking |
| `docs/release/AUTH-07-test-evidence.md` | Pre-deploy test results |
| `docs/specs/AUTH-07-production-deployment-spec.md` | Deployment specification |
| `scripts/deploy.sh` | Modified — 5 hardening fixes |
| `scripts/rollback.sh` | Rollback mechanism |
| `scripts/smoke-test.sh` | Post-deploy health checks |
| `docker-compose.yml` | Service definitions |
| `.gitignore` | Modified — added `.deploy-state/` |
| `.github/workflows/ci.yml` | CI pipeline |
| `.env` | Recreated during deployment (gitignored) |
| `LMS-Server/.env` | Reconstructed during deployment (gitignored) |

## Assessment Areas

### 1. Release Completeness
- Are all claimed PRs (#71-#74) present in the commit history?
- Do the 4 production files match the claimed changes?
- Are all 76 new tests present?
- Are the 5 deploy script fixes applied?

### 2. Deployment Correctness
- Does the deploy log confirm success?
- Did smoke tests pass?
- Is data integrity verified?
- Was the correct SHA deployed?

### 3. Actual Deployed Commit Identification
- What SHA does production report via `/health`?
- Does this match a commit in local history?
- What code does this SHA contain?
- Discrepancy between `0dd2385` (deployed) and `535ac1a` (local HEAD)?

### 4. Local Git Commits Not Yet Pushed
- What are the 3 unpushed commits?
- Are they a linear chain from remote main?
- Do they contain only safe changes?
- Is `535ac1a` (post-deploy docs) safe to push?

### 5. Security and Infrastructure Changes
- Are deploy.sh changes correct and safe?
- Is the `.gitignore` change complete?
- Were `.env` files properly excluded?
- No secrets in commit diffs?

### 6. Database and Uploads Preservation
- Are Docker volumes intact?
- Does data integrity check show expected counts?
- Is the pre-deploy backup accessible?

### 7. Deployment Configuration Safety
- Is `COMPOSE_PROJECT_NAME=lms-ammawallet` correct?
- Are `.env` file permissions appropriate?
- Is the `VITE_CLERK_PUBLISHABLE_KEY` placeholder safe?

### 8. Health Checks and Monitoring
- Is the health endpoint responding?
- Are all health sub-checks passing?
- Is the build SHA correct in the response?

### 9. Rollback Readiness
- Are previous image IDs saved?
- Is `rollback.sh` executable and functional?
- Is the pre-deploy DB backup intact?
- Are git revert commands documented?

### 10. Outstanding Security Risks
- SEC-01 through SEC-04 from AUTH-06?
- COHORT-IDOR remediation status?
- Rollback.sh localhost health check issue?
- Container running as root?

### 11. Documentation Accuracy
- Does the deployment report match actual events?
- Are SHAs correctly recorded?
- Are timestamps plausible?
- Are rollback instructions correct?

### 12. Required Follow-up Testing
- Has CI run on the deployed SHA?
- Are E2E tests covering sponsor authorization?
- Are deployment script changes tested?
- What tests cannot run locally?

## Method

For each area: verify claims against actual system state, classify findings by severity (CRITICAL / HIGH / MEDIUM / LOW / INFO), provide evidence.
