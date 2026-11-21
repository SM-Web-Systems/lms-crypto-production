# Batch 3 — Deploy Report

> Date: 2026-07-28
> Deploy #6 in audit remediation series
> Deployed commit: `bf64194` (main)

---

## Deploy Execution

| Step | Status |
|------|--------|
| Pre-deploy tests (488/488 + 23/23) | PASS |
| `docker compose up -d --no-deps --build amma-api` | SUCCESS |
| Container rebuilt | SUCCESS |
| Container restarted | SUCCESS |

---

## Post-Deploy Validation

| Check | Result | Details |
|-------|--------|---------|
| Health endpoint | PASS | `{"status":"ok","network":"public"}` |
| Auth gate (/auth/me) | PASS | Returns 401 (correct) |
| Frontend (/) | PASS | Returns 200 |
| Trustline validation | PASS | Returns 400 for invalid key (Batch 2 fix persists) |
| Curated tokens public | PASS | Returns 200 with 24 tokens |
| Container logs | CLEAN | No errors or warnings |

---

## Rollback Plan

If issues arise:
```bash
git revert bf64194
cd /home/webadmin/amma-wallet-docker && docker compose up -d --no-deps --build amma-api
```

---

## Deploy History

| # | Date | Branch | Commit | Fixes |
|---|------|--------|--------|-------|
| 1 | 2026-07-27 | phase5 | various | Initial security fixes |
| 2 | 2026-07-27 | phase6a | various | Phase 6a fixes |
| 3 | 2026-07-27 | phase6b | various | Phase 6b fixes |
| 4 | 2026-07-28 | fix/backlog-batch1 | `a96b7ed` | 10 Batch 1 fixes |
| 5 | 2026-07-28 | fix/backlog-batch2 | `f53231c` | 10 Batch 2 fixes |
| **6** | **2026-07-28** | **fix/backlog-batch3** | **`bf64194`** | **11 Batch 3 fixes** |
