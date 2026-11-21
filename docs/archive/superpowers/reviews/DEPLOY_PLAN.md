# Batch 1 — Deploy Plan

> Date: 2026-07-28
> From: `main` at `461bada` (merge commit)
> Target: production (`amma-api` container)

---

## Pre-Deploy Checklist

- [x] Merge to main complete
- [x] 410/410 backend tests on main
- [x] No secrets in diff
- [x] Tag `batch1-complete-2026-07-28` created

## Deployment Steps

### 1. Push to GitHub
```bash
source ~/.env.git-write
git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/amma-wallet-production.git main
git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/amma-wallet-production.git batch1-complete-2026-07-28
```

### 2. Rebuild and restart API container
```bash
cd ~/amma-wallet-docker
docker compose up -d --no-deps --build amma-api
```

### 3. Post-deploy validation
- Health endpoint
- Container logs (no crash, no unexpected warnings)
- Auth flow (login/register accessible)
- Config warning NOT emitted (TURNSTILE_SECRET_KEY should be set)

## Rollback Plan

If validation fails:
```bash
git revert 461bada --no-commit  # revert merge commit
git commit -m "revert: Batch 1 rollback"
cd ~/amma-wallet-docker && docker compose up -d --no-deps --build amma-api
```

## Changes Affecting Production Behavior

| Change | Production Impact |
|--------|------------------|
| PII console.log removed | Less log noise (3 fewer lines per sign-and-submit) |
| TURNSTILE_SECRET_KEY warning | Only if key is empty — should NOT fire in production |
| Silent catch → console.warn | May see occasional `lastUsedAt update failed` warnings |
| Division by zero guard | Only triggers on invalid swap inputs (edge case) |
| Quote validation | Rejects zero/negative/NaN amounts before Horizon call |
| Billing validation | Rejects zero/negative credits (prevents balance corruption) |
| ILIKE escape | Search queries with `%` or `_` now match literally |
| Rate-limit eviction | Invisible — memory management only |
| Token cleanup | Old verification links stop working on re-send (intended) |
| DELETE 404 | Callers get 404 instead of 200 for missing contacts |

All changes are low-risk defensive improvements. No schema changes. No API additions.
