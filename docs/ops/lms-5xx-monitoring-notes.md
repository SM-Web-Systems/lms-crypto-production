# LMS 5xx monitoring: notes (2026-11-16 to 2026-11-18)

## What the alerts were
The health monitor alerts on any 5xx. The alerts on 2026-11-16 (15:00Z) and 2026-11-17 (18:55Z) were
deploy restarts of `lms-api`, not faults:

- While the old container is gone and the new one is not yet listening, nginx returns **502**
  (`connect() failed (111: Connection refused)` in the nginx error log).
- For a few seconds after start, the API is in its release hold and returns **503** in 1 to 5 ms.
- The release state file (`approved-release.json`) is rewritten about 5 to 7 seconds after start. After
  that the same requests return 200.

Only background polls of an already-open page failed (notifications, unread-count, auth/me). No login,
submission or reward action failed, and the next poll about 30 seconds later succeeded. The API log showed
0 restarts and no out-of-memory kill. On 2026-11-16 there were 16 LMS 5xx in total, 2 browsers, all inside
deploy windows of 10 seconds or less.

## Gaps found
- The monitor counted 5xx only in the `lms-api` log, so the nginx 502s were never counted (the 15:00Z alert
  said 2, the real number was 3).
- Alerts did not say who was affected or when.

Decision (owner, 2026-11-16): do not suppress post-deploy alerts. Every user affected, and when, must be visible.

## What changed (PR #242, f6ce9f2)
- nginx writes an `lms_edge` JSON access line per LMS request (`docs/ops/lms-edge-5xx-log.conf`).
- `monitor_evidence.py five-xx` counts edge 5xx; the monitor reports the higher of the API and edge counts.
- The alert lists each failed request (time, status, method, path without query string, client IP, upstream
  status) and the LMS accounts seen from each IP (`lms-5xx-user-lookup.js`, read-only SQLite over
  `active_sessions` and `login_history`; never prints emails, tokens or session ids).
- Settings: `LMS_EDGE_LOG_CONTAINER` (nginx container name; unset = old behaviour) and
  `LMS_5XX_USER_LOOKUP` (0 disables the account lookup).

## Mapping an IP to a user
Matching is by IP only. When several accounts share an IP (an office or home connection), the alert lists up
to 3 recent accounts and cannot say which one hit the error. The 2026-11-16/17 errors were all test accounts
(LMS Test Learner A and B, Admin A, Learner 20).

## Operating notes
- Production rollout: nginx snippet, new bundle, cron line with `LMS_EDGE_LOG_CONTAINER=nginx_server`.
  Rollback: restore the crontab backup and remove the two `access_log` lines.
- If `nginx_server` is recreated its logs reset; the monitor only reads the last 5 minutes, so this is safe.
- The monitor's Bash tests time out under Git Bash on Windows; run them on Linux or WSL.
- Possible later work: zero-downtime API swap, which would remove the deploy-time 502/503 window.
