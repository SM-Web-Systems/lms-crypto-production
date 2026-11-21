# Incident Spec: LMS ammaWallet.network "MISSING" Alert Storm

**Date:** 2026-08-12
**Duration:** ~18 hours (2026-08-11T16:40Z — 2026-08-12T10:42Z)
**Severity:** Low (false positive alerts, no service impact)
**Alerts fired:** 217

## Root Cause

Phase 21 C1 (Observability & DevOps, 2026-08-06) refactored the LMS `/api/v1/health` endpoint. The `ammaWallet` field moved from the top level to under a new `checks` object:

```
# Before (Phase 20 and earlier)
{ "status": "ok", "ammaWallet": { "network": "public" } }

# After (Phase 21 C1+)
{ "status": "ok", "checks": { "ammaWallet": { "configured": true, "network": "public" } } }
```

The monitor script (`/home/webadmin/scripts/amma-monitor.sh`, Check #6, line 131) was not updated to match the new response shape. It used:

```python
d.get('ammaWallet',{}).get('network','MISSING')
```

Which returned `MISSING` since `ammaWallet` no longer exists at the top level.

## Why It Wasn't Caught Sooner

- The health endpoint change was deployed on 2026-08-06 but the LMS API container wasn't restarted until 2026-08-11 (the Phase 27 C1 deploy), so the old response shape was cached in-memory
- The monitor ran successfully for ~25 days before the API restart exposed the mismatch

## Fix Applied

Updated `amma-monitor.sh` line 131-132 to use backward-compatible path:

```python
d.get('checks',{}).get('ammaWallet',{}).get('network',
    d.get('ammaWallet',{}).get('network','MISSING'))
```

This checks `checks.ammaWallet.network` first, falls back to top-level `ammaWallet.network`.

## What the Monitor Checks

| # | Check | Endpoint/Source | Expected |
|---|-------|-----------------|----------|
| 1 | Health network field | `ammawallet.com/api/v1/health` → `.network` | `"public"` |
| 2 | Container health | `docker inspect amma-api, amma-db` | `"healthy"` |
| 3 | 500 errors (5m window) | `docker logs amma-api --since 5m` → `level:50` | 0 |
| 4 | SSO callback failures | `docker logs amma-api --since 5m` → sso patterns | 0 |
| 5 | Token indexer | `amma-db` SQL: token counts + last update | pubnet > 0, testnet = 0, update < 2h |
| 6 | LMS ammaWallet network | `lms.smwebsystems.com/api/v1/health` → `.checks.ammaWallet.network` | `"public"` |

## How to Debug Next Time

1. Run the monitor manually: `/bin/bash /home/webadmin/scripts/amma-monitor.sh`
2. Check the raw health response: `curl -s https://lms.smwebsystems.com/api/v1/health | python3 -m json.tool`
3. Compare the Python extraction path against the actual JSON shape
4. Check `/home/webadmin/logs/amma-monitor.log` for when alerts started vs. when health endpoint code last changed
