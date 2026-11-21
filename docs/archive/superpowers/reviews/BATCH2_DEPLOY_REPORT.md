# Batch 2 — Deploy Report

> Date: 2026-07-28
> Commit: `f53231c`
> Container: `amma-api` rebuilt and restarted

---

## Deploy Execution

1. GitHub push: `11ced90..f53231c` with tag `batch2-complete-2026-07-28`
2. Docker rebuild: `docker compose up -d --no-deps --build amma-api`
3. Build: cached deps, new source layer only
4. Container recreated and started successfully

## Post-Deploy Validation

| Check | Result |
|-------|--------|
| Health endpoint | 200 OK — `{"status":"ok","network":"public"}` |
| Auth (invalid login) | Turnstile gate active — `"Human verification required"` |
| Trustline validation | 400 — `"Invalid Stellar public key format"` (Fix 1 working) |
| Frontend | 200 OK |
| Startup logs | Clean — normal toml-sync fetch failures only |
| New warnings/errors | None |

## Production Behavior Confirmed

- Trustline input validation returning 400 for invalid keys (was 500 pre-Batch 2)
- All other endpoints responsive
- No regression detected
