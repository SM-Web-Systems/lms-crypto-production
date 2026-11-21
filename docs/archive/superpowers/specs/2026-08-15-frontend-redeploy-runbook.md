# Frontend Redeploy Runbook

**Date:** 2026-08-15
**Status:** READY — AWAITING EXPLICIT APPROVAL
**Scope:** lms-web container only (TypeScript-only fix)

---

## Preconditions

All must be VERIFIED before deployment:

| Gate | Status | Evidence |
|------|--------|----------|
| TypeScript build | VERIFIED | 0 errors after a7549b1 |
| Frontend tests | VERIFIED | 206/206 pass |
| Docker build | VERIFIED | Image `68ea5b1bc4d0` built 2026-08-15T04:48Z |
| E2E tests | VERIFIED | 14/14 pass |
| Change scope | VERIFIED | TypeScript-only (ParentDashboard, SponsorPortal, types/) |
| No runtime changes | VERIFIED | No env, API, or config changes |

## Image Identity

| Property | Value |
|----------|-------|
| Image name | `lms-ammawallet-web` |
| New image ID | `68ea5b1bc4d0` |
| New image created | 2026-08-15 06:48 SAST |
| Running container image | SHA `414399394569` |
| Running container started | 2026-08-12T09:55Z |
| Compose service | `web` |

## Exact Deployment Command

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose up -d --no-deps web
```

**CRITICAL:** `--no-deps` ensures only `web` is restarted, not the API or database.

**CRITICAL:** Must use `docker compose build web` first if image needs rebuilding. Current image `68ea5b1bc4d0` was already built and includes the TS fixes.

## Approval Gate

This command MUST NOT execute without explicit human approval.

Approval checklist:
1. Correct host (ScarletFlamingo production server)
2. Correct compose project (lms-ammawallet)
3. Correct service (web only)
4. Image identity confirmed (68ea5b1bc4d0)
5. Rollback image identified (414399394569)
6. No secrets printed
7. Health checks defined
8. Rollback procedure defined

## Post-Deploy Verification

```bash
# 1. Container running
docker compose ps web

# 2. Container health
docker inspect lms-web --format '{{json .State}}'

# 3. Image identity matches new build
docker inspect lms-web --format '{{.Config.Image}}'

# 4. Logs clean
docker logs --since 5m lms-web 2>&1 | tail -50

# 5. Frontend accessible (via container network)
docker inspect lms-web --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{"\n"}}{{end}}'
# Then curl the container IP on port 80
```

## Rollback Procedure

If deployment fails or frontend is broken:

```bash
# Option A: Rebuild with previous commit and redeploy
git stash  # if needed
git checkout a7549b1^  # previous working commit
docker compose build web
docker compose up -d --no-deps web

# Option B: If old image still available
docker tag 414399394569 lms-ammawallet-web:rollback
docker compose up -d --no-deps web  # after updating compose to use :rollback tag
```

## Failure Handling

1. Capture exact error output.
2. Do NOT improvise alternative deployment commands.
3. Check `docker logs lms-web` for startup errors.
4. Check nginx configuration if frontend serves but returns errors.
5. If rollback requires separate approval, STOP and report.
6. Never force-remove a running container without approval.

## Evidence Checklist

After successful deployment, record:

- [ ] Container status: running
- [ ] Container image: matches new build ID
- [ ] Container started: after deployment time
- [ ] Logs: no errors in last 5 minutes
- [ ] Frontend: accessible via network
- [ ] HTTPS: accessible via public URL (if safe to check)

## No-Approval/No-Deploy Rule

If explicit approval has not been received, the deployment command MUST NOT execute. No implied approval, no assumed consent, no "proceeding unless you stop me" patterns.
