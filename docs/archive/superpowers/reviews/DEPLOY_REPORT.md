# Batch 1 — Deploy Report

> Date: 2026-07-28
> Deployed from: `main` at `461bada`
> Tag: `batch1-complete-2026-07-28`

---

## Deployment

| Step | Status | Details |
|------|--------|---------|
| Push to GitHub | ✅ | `c9e66a5..461bada main -> main` |
| Push tag | ✅ | `batch1-complete-2026-07-28` |
| Container rebuild | ✅ | `docker compose up -d --no-deps --build amma-api` |
| Container start | ✅ | `amma-api` recreated and started |

## Post-Deploy Validation

| Check | Result |
|-------|--------|
| Health endpoint | ✅ `{"status":"ok","network":"public"}` |
| Container logs | ✅ Clean — no crashes, no unexpected warnings |
| TURNSTILE_SECRET_KEY warning | ✅ NOT emitted (key is set in production) |
| Login endpoint | ✅ Returns 400 for invalid input (correct) |
| Frontend | ✅ Returns 200 |
| lastUsedAt warnings | ✅ None observed |

## Zero Downtime

Container was recreated with `--no-deps` (no DB restart). Downtime limited to container restart time (~2 seconds).

## Rollback Notes

If issues discovered later:
```bash
git revert 461bada -m 1
cd ~/amma-wallet-docker && docker compose up -d --no-deps --build amma-api
```
