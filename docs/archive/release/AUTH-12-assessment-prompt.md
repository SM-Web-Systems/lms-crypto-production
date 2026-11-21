# AUTH-12: Production Stability Assessment Prompt

**Date:** 2026-10-22
**Operator:** Claude (automated)
**Purpose:** Verify AUTH-11 deployment stability, monitoring durability, and release closure readiness

---

## Assessment Scope

Evaluate the following 12 areas to confirm that the AUTH-11 production deployment is stable, correctly documented, and ready for release closure.

### B1 — AUTH-11 Deployment Report

**Source:** `docs/release/AUTH-11-production-deployment-report.md`

- Does the report accurately reflect the deployed SHA and deployment timeline?
- Are all verification results (UID, read-only FS, SQLite, smoke tests, SHA) recorded with evidence?
- Is the downtime measurement consistent with Docker logs and health endpoint timestamps?
- Is the rollback readiness documented with image tags and backup paths?
- Is the 24-hour observation plan actionable and complete?

### B2 — AUTH-11 Task Checklist

**Source:** `docs/release/AUTH-11-task-checklist.md`

- Are all 79 tasks marked with final status?
- Do safety gate results match the evidence collected during deployment?
- Are Phases 12-14 marked PASS with accurate evidence?
- Is the deployment sequence timing recorded?

### B3 — AUTH-11 Developer Specification

**Source:** `docs/specs/AUTH-11-controlled-deployment-spec.md`

- Is the status updated to reflect completed deployment?
- Do acceptance criteria match actual deployment outcomes?
- Are failure scenarios documented with actual mitigations used?

### B4 — Production Runtime Configuration

- Does `docker exec lms-api whoami` return `node`?
- Does `docker exec lms-api id` show uid=1000, gid=1000?
- Is `ReadonlyRootfs` = `true`?
- Is the build SHA in the health endpoint the authorized target?
- Is the container restart count 0?

### B5 — Docker Health

- Are both `lms-api` and `lms-web` containers healthy?
- Is the Docker healthcheck passing consistently?
- Are there any error messages in container logs since deployment?
- What is the current container uptime?

### B6 — SQLite Persistence

- Is the database responding to health checks (latency, status)?
- Is the journal mode WAL?
- Are WAL and SHM files present and owned by uid=1000?
- Can the database be read by the non-root process?
- Is PRAGMA integrity_check passing?

### B7 — Upload Permissions

- Are all upload subdirectories (avatars, documents, imports, submissions) owned by uid=1000?
- Can the non-root process write to upload directories?
- Are existing uploaded files readable?

### B8 — Health Monitor

- Is the health monitor cron entry installed with correct schedule (*/5)?
- Is the heartbeat file being updated at the expected interval?
- Does the CSV log show consistent scheduled executions?
- Are all 9 monitoring dimensions reporting correctly?
- Is log rotation configured?

### B9 — Dead-Man Monitor

- Is the dead-man check cron entry installed with correct schedule (*/15)?
- Is stale heartbeat detection working?
- Is the dead-man check log showing OK entries?
- Was the earlier email failure (14:02:48) resolved after msmtp configuration?

### B10 — Email Alert Delivery

- Is msmtp configured for the webadmin user?
- Can msmtp deliver email successfully (exit code 0)?
- Is the alert email address correct?
- Does the monitoring script use the correct msmtp invocation?
- Is the dead-man script able to send alerts?

### B11 — Backup and Rollback Evidence

- Does the pre-AUTH11 backup exist with valid checksum?
- Are daily backups continuing to run after deployment?
- Are rollback images tagged and available?
- Is the rollback script tested and documented?
- Can a rollback be executed without volume ownership revert?

### B12 — Git Synchronization

- Is the AUTH-11 deployment report committed and pushed to origin/main?
- Is the AUTH-11 task checklist up-to-date and pushed?
- Is the AUTH-11 spec status updated?
- Are there any uncommitted changes that should be tracked?
- Is the local branch in sync with remote?

---

## Assessment Output

For each area (B1-B12), provide:

1. **Verdict:** PASS / PASS WITH CONDITIONS / FAIL / BLOCKED
2. **Evidence:** Specific commands, file references, or log excerpts
3. **Risk:** Any identified risks
4. **Action:** Required or suggested actions
