# AUTH-11: Deployment Assessment Prompt

**Date:** 2026-10-22
**Operator:** Claude (automated)
**Purpose:** Systematic assessment of deployment readiness for AUTH-10 infrastructure hardening

---

## Assessment Scope

Evaluate the following 14 areas to determine whether the AUTH-10 infrastructure changes can be safely deployed to production.

### A1 — AUTH-10 Developer Specification

**Source:** `docs/specs/AUTH-10-infrastructure-hardening-spec.md`

- Are all security requirements (SR-01 through SR-05) addressed by the implementation?
- Are all operational requirements (OR-01 through OR-06) addressed?
- Are all compatibility requirements (CR-01 through CR-06) testable and verified?
- Are threat model accepted risks (SEC-INFRA-03) documented accurately?
- Are rollback procedures complete and tested?

### A2 — AUTH-10 Infrastructure Hardening Report

**Source:** `docs/release/AUTH-10-infrastructure-hardening-report.md`

- Does the report accurately reflect the merged changes?
- Are all test results recorded with evidence?
- Is the security review verdict documented?
- Is the deployment checklist complete and actionable?
- Does the rollback procedure account for volume ownership differences?

### A3 — Dockerfile

**Source:** `LMS-Server/Dockerfile`

- Is `USER node` placed after all root-required operations?
- Does `chown` cover all runtime-writable paths within the image layer?
- Is the `node` user (uid=1000) confirmed present in the base image?
- Does the entrypoint execute as the non-root user?
- Are build-time dependencies isolated from runtime?

### A4 — Docker Entrypoint

**Source:** `LMS-Server/docker-entrypoint.sh`

- Can the entrypoint execute successfully as uid=1000?
- Does `npx tsx src/scripts/initDb.ts` work without root?
- Is the DATABASE_PATH default compatible with the volume mount?
- Does the script handle an existing database correctly (skip init)?
- Can the entrypoint write to /app/data when it is a named volume?

### A5 — Docker Compose

**Source:** `docker-compose.yml`

- Is `read_only: true` correctly scoped to the api service only?
- Are tmpfs mounts sufficient for all runtime temporary writes?
- Do named volumes remain writable despite read-only overlay?
- Is the healthcheck compatible with non-root execution?
- Does the web service remain unchanged and functional?
- Are network configurations preserved?

### A6 — Deploy Script

**Source:** `scripts/deploy.sh`

- Does the deploy script account for non-root container behavior?
- Is the pre-deploy database backup WAL-safe (uses sqlite3 .backup)?
- Does the data verification step work when the container runs as node?
- Does the BUILD_SHA verification work correctly?
- Is the automatic rollback triggered on health check failure?
- Does the rollback invocation work when transitioning from root to non-root images?

### A7 — Rollback Script

**Source:** `scripts/rollback.sh`

- Can rollback restore the previous root-running images?
- Does image tagging and container recreation work correctly?
- Is the health check URL configurable and correct?
- Does rollback preserve database and upload volumes?
- What happens to volume ownership if rolling back from non-root to root?

### A8 — Smoke Test

**Source:** `scripts/smoke-test.sh`

- Do all 5 checks work after a non-root deployment?
- Is the health endpoint reachable through the nginx proxy?
- Does the DB readiness check verify actual database connectivity?
- Does the BUILD_SHA check confirm the correct deployment?

### A9 — Health Monitor

**Source:** `scripts/lms-health-monitor.sh`

- Does the script execute safely in a cron environment?
- Are all 7 health dimensions checked?
- Is the heartbeat file written to a persistent, writable location?
- Does CSV logging work with correct file permissions?
- Is email alerting functional through msmtp?
- Does log rotation prevent unbounded growth?
- Does the script expose any secrets or customer data?

### A10 — Dead-Man Check

**Source:** `scripts/lms-deadman-check.sh`

- Is the heartbeat age calculation correct?
- Does the stale threshold align with the monitor schedule?
- Is the alert mechanism independent of the health monitor?
- Are log files managed with rotation?

### A11 — Production Volume Ownership and Permissions

**Inspection required:** Docker volume host paths

- What are the current UID/GID and permission modes for all files in lms-data and lms-uploads?
- Will uid=1000 (node) be able to read/write the SQLite database?
- Will uid=1000 be able to create/update WAL and SHM sidecar files?
- Will uid=1000 be able to write to all upload subdirectories?
- Does the Dockerfile `chown` affect existing volume data, or only image-layer directories?
- What is the minimum safe ownership transition procedure?
- Can the transition be reversed for rollback to root-running images?

### A12 — Database Backup and Recovery

**Sources:** `scripts/deploy.sh`, backup directory, Docker volume paths

- Is the backup path (`/home/webadmin/backups/lms-ammawallet-db/`) correct and accessible?
- Does the SQLite `.backup` command produce WAL-consistent snapshots?
- Are backup files non-empty, integrity-checked, and permission-protected?
- Is the database path in the container (`/app/data/student_ms.db`) consistent with the volume mount?
- Is the host volume path (`/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/`) confirmed?
- Does the backup procedure work regardless of container UID?
- Is manual restore documented and tested?

### A13 — Monitoring and Alert Delivery

**Sources:** crontab, msmtp configuration, log directories

- Is msmtp configured and functional for alert delivery?
- Do monitoring log directories exist with appropriate permissions?
- Are existing monitoring cron jobs (lms-data-check.sh, disk_alert.sh) preserved?
- Will the new monitoring scripts conflict with existing jobs?
- Is the cron PATH environment sufficient for script execution?
- Can a test alert be sent to verify delivery?

### A14 — CI and Regression Coverage

**Sources:** GitHub Actions, test results

- Is the candidate SHA (`27f9535`) green on GitHub CI?
- Do all backend tests (1,604) pass?
- Do all frontend tests (450) pass?
- Do E2E tests pass?
- Do infrastructure tests (Dockerfile hardening, monitoring) pass?
- Do TypeScript type checks pass?
- Does the frontend build succeed?
- Is there a gap between static test assertions and runtime behavior?

---

## Assessment Output

For each area (A1-A14), provide:

1. **Verdict:** PASS / PASS WITH CONDITIONS / FAIL / BLOCKED
2. **Evidence:** Specific commands, file references, or test results
3. **Risk:** Any identified risks, even if passing
4. **Recommendation:** Required or suggested actions before deployment

Overall assessment: READY / NOT READY / BLOCKED
