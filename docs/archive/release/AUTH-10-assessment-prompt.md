# AUTH-10: Infrastructure Hardening Assessment Prompt

**Date:** 2026-10-22
**Assessor:** Claude (automated)
**Scope:** AUTH-09 closure verification, infrastructure security posture, monitoring gaps, deployment readiness

---

## Assessment Objective

Evaluate the current LMS production infrastructure to determine:
1. Whether AUTH-09's final operational evaluation is complete and consistent.
2. Whether the production stability verdict is supported by evidence.
3. What infrastructure security gaps remain (SEC-INFRA-01 through SEC-INFRA-03).
4. What monitoring capabilities are missing.
5. What deployment/rollback script improvements need validation.

## Assessment Areas

### A1 — AUTH-09 Final Operational Evaluation

Verify:
- Production SHA `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` matches health endpoint evidence.
- Observation window: deploy start 2026-10-19T18:07:24Z to final check 2026-10-22T05:16Z (59.1h).
- UTC/SAST conversions are correct (UTC+2).
- Error/fatal/warn/5xx/restart counts are supported by `docker logs` evidence.
- Gaps in log retention or metric visibility are disclosed.
- No unexpected restarts or deployment events occurred during the observation.
- The session-scoped cron job (d1a56690) is NOT represented as durable monitoring.
- Deferred deployment-script validation (rollback.sh health URL, deploy.sh SHA exit) remains documented.

### A2 — AUTH-09 Report and Checklist Consistency

Cross-reference:
- `AUTH-09-production-stability-and-security-report.md` verdict, metrics, timestamps.
- `AUTH-09-task-checklist.md` Phase 2.5 completion status.
- `AUTH-09-assessment-findings.md` original findings vs. current state.
- `AUTH-09-security-impact-analysis.md` deferred items.

### A3 — Container Security Posture (SEC-INFRA-01)

Analyze:
- `LMS-Server/Dockerfile` — user directives, build stages, runtime identity.
- `docker-compose.yml` — user mappings, capabilities, security options.
- Container runtime: `docker inspect lms-api` uid/gid.
- Volume ownership: `/app/data`, `/app/uploads` within the container.
- `docker-entrypoint.sh` — what runs as root, what needs root.
- Base image `node:22-bookworm-slim` — available non-root users (node uid=1000).
- SQLite WAL/SHM file creation requirements.
- `npm ci` build-time vs. runtime requirements.

### A4 — Container Filesystem (SEC-INFRA-02)

Analyze:
- Current `ReadonlyRootfs` status via `docker inspect`.
- All container write paths (runtime, not build-time).
- Which writes go to volumes vs. container overlay filesystem.
- tmpfs requirements for `/tmp` and any transient paths.
- Node.js runtime temporary file usage patterns.
- Application logging output (stdout/stderr vs. file).

### A5 — Secret Delivery (SEC-INFRA-03)

Review:
- Current `env_file` mechanism.
- Secret visibility via `docker inspect`.
- `.env` file permissions and gitignore status.
- Application code that reads `process.env.*`.
- Accepted-risk disposition and conditions for revisiting.

### A6 — Deployment and Rollback Scripts

Review:
- `scripts/deploy.sh` — AUTH-09 SHA mismatch fix (merged, not production-tested).
- `scripts/rollback.sh` — AUTH-09 health URL fix (merged, not production-tested).
- `scripts/smoke-test.sh` — current test coverage.
- `scripts/test-scripts.sh` — script validation test suite.
- `.github/workflows/deploy.yml` — deployment pipeline safety.

### A7 — CI/CD and Test Coverage

Review:
- `.github/workflows/ci.yml` — backend, frontend, E2E jobs.
- Backend test count and coverage areas.
- Frontend test count and build verification.
- E2E test coverage (Playwright).
- TypeScript type checking scope.
- Missing test categories for infrastructure changes.

### A8 — Production Monitoring Limitations

Assess:
- Current monitoring: Docker healthcheck only (15s interval).
- No external health monitoring.
- No 5xx alerting.
- No restart detection (beyond `docker inspect`).
- No disk/memory alerting.
- No dead-man / missed-check detection.
- No log aggregation or structured query.
- Previous session-scoped cron (not durable) is NOT operational monitoring.
- `lms-data-check.sh` (6-hourly cron) — what does it cover?

### A9 — Backup and Recovery

Review:
- Pre-deploy backup mechanism (`sqlite3 .backup`).
- Backup file inventory and retention.
- Rollback image availability (`previous-images.txt`).
- Recovery time estimate.
- Backup verification (are backups tested?).

### A10 — Network and Reverse Proxy

Review:
- Docker network topology (default, web-stack_default, stalwart_bridge).
- Nginx reverse proxy routing to lms-api and lms-web.
- TLS termination.
- Port exposure model (expose vs. ports).

## Output

For each area, provide:
- **Verdict**: PASS / PASS WITH CONDITIONS / FAIL / NOT APPLICABLE
- **Evidence**: Specific commands, file paths, line numbers
- **Findings**: Issues found
- **Recommendations**: Actions for AUTH-10
- **Priority**: HIGH / MEDIUM / LOW

Create findings in `docs/release/AUTH-10-assessment-findings.md`.
