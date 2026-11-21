# LMS Stabilization Plan — Sep 2026

**Start:** 2026-09-07 (after Phase 3 deploy)
**Duration:** 7 days (until 2026-09-14)
**Goal:** Confirm all recent changes are stable in production before starting new work.

---

## What "Stable" Means

The system is stable when ALL of the following hold for 7 consecutive days:

1. **No data anomalies** — 6h monitoring script reports OK at every check. Row counts never drop below baseline (users ≥ 15, courses = 4, nfts = 10).

2. **No unplanned restarts** — API container uptime stays continuous (check via health endpoint `uptime` field). No OOM kills or crash loops.

3. **No user-reported issues** — No reports of missing data, broken pages, or authentication failures from admin or students.

4. **Backups succeeding** — Daily 03:00 UTC backup runs and produces a file ≥ 5MB. No row-count guard alerts in backup log.

5. **No new errors in logs** — `docker compose logs api` shows no new ERROR-level entries related to deletion, forum, or database modules.

---

## Daily Check (< 2 minutes)

Run once per day during the stabilization period:

```bash
# 1. Monitoring log — last few entries should say OK
tail -5 /home/webadmin/logs/lms-data-check.log

# 2. Health + uptime
curl -fsS https://lms.smwebsystems.com/api/v1/health | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'status={d[\"status\"]} uptime={d[\"uptime\"]}s sha={d[\"buildSha\"][:7]}')
"

# 3. Latest backup exists and is reasonably sized
ls -lh /home/webadmin/backups/lms-ammawallet-db/ | tail -3

# 4. Any errors in API logs (last 100 lines)
docker compose logs api --tail 100 2>&1 | grep -c '"level":"error"'
```

If everything is green, no action needed. If anything looks wrong, investigate before it becomes an incident.

---

## What's Deferred Until After Stabilization

| Item | Priority | Notes |
|------|----------|-------|
| Fix 20 pre-existing E2E failures | Medium | payment-flow, message-admin-audit, account-deletion COMP-02 |
| Admin UI polish | Low | Filtering by deletion_type, date range, user search in audit views |
| Notification enhancements | Low | No specific requirements yet |
| Course/LMS UX improvements | Low | No specific requirements yet |

---

## Exit Criteria

On or after 2026-09-14, review:

1. Were all daily checks green? → System is stable. Proceed with next priorities.
2. Were there any issues? → Document, fix, and extend the stabilization period if needed.
3. Choose next work from the deferred list above, or define new priorities.

---

## Current Production State (Snapshot at Stabilization Start)

| Metric | Value |
|--------|-------|
| Deployed SHA | `cfa2405` (tag: `phase3-account-deletion-2026-09-07`) |
| Users | 17 (15 real + 2 smoke) |
| Courses | 4 |
| NFT Credentials | 10 |
| Lesson Completions | 47 |
| Forum Topics | 3 |
| Forum Posts | 4 |
| Backend Tests | 1413/1413 |
| E2E Tests | 38/58 (20 pre-existing failures) |
| Backups | 8 snapshots (Aug 26 – Sep 7) |
| Monitoring | 6h cron, CSV history, threshold alerts |
