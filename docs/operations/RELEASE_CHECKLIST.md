# Release Checklist

## Pre-Merge

- [ ] Branch based on current `origin/main`.
- [ ] Working tree clean.
- [ ] No secrets, `.env` files, database backups, or user data in diff.
- [ ] Tests passed (backend and frontend, record exact counts).
- [ ] TypeScript/lint checks passed.
- [ ] PR created and reviewed.
- [ ] CI status recorded (or local test results documented if CI unreadable).

## Pre-Deployment

- [ ] Main SHA recorded before merge.
- [ ] Merge commit SHA recorded after merge.
- [ ] `BUILD_SHA` identified: `git rev-parse HEAD` on merged main.
- [ ] Actual Compose service names verified: `docker compose config --services`.
- [ ] Current container/image state recorded before deployment.
- [ ] Backup created only if a data migration is planned.
- [ ] Migration dry run passed, if applicable.
- [ ] Rollback path documented (last known-good image SHAs or source revision).

## Deployment

- [ ] Build only intended services with `BUILD_SHA`:
  ```bash
  BUILD_SHA="$(git rev-parse HEAD)" docker compose build --no-cache api web
  ```
- [ ] Deploy only intended services:
  ```bash
  BUILD_SHA="$(git rev-parse HEAD)" docker compose up -d --no-deps api web
  ```
- [ ] Do not restart unrelated services (database, CRM, AmmaWallet, mail, nginx).
- [ ] Verify container health: `docker compose ps`.
- [ ] Verify API health and buildSha:
  ```bash
  curl -fsS https://lms.smwebsystems.com/api/v1/health | jq '{status, buildSha}'
  ```
- [ ] Verify frontend build SHA visible in Admin Dashboard system info footer.

## Post-Deployment

- [ ] Smoke tests passed (or `scripts/smoke-test.sh`).
- [ ] BVC course content unaffected (course count, item structure unchanged).
- [ ] Data/course integrity checks passed (no unexpected record changes).
- [ ] Migration idempotency verified where relevant.
- [ ] Deployed SHA recorded in deployment record.
- [ ] Handover document updated if this is a milestone release.

## Rollback

If the deployed application breaks:

1. **Immediate**: redeploy the last known-good images or source revision.
2. **Source rollback** (for merge commits):
   ```bash
   git revert -m 1 <merge-commit-sha>
   ```
   Create a reviewed revert commit/PR. Do not use plain `git revert` on merge commits without `-m 1`.
3. No database rollback is needed for code-only releases (no migration).
