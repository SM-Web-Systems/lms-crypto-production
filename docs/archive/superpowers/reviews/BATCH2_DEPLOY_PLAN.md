# Batch 2 — Deploy Plan

> Date: 2026-07-28
> Merge commit: `f53231c`
> Tag: `batch2-complete-2026-07-28`

---

## Pre-Deploy Checklist

- [x] Merge to main: `f53231c`
- [x] Post-merge tests: 453/453
- [x] Push to GitHub: `11ced90..f53231c`
- [x] Tag pushed: `batch2-complete-2026-07-28`

## Deploy Steps

1. `cd ~/amma-wallet-docker && docker compose up -d --no-deps --build amma-api`
2. Wait for container healthy
3. Check logs for startup errors

## Post-Deploy Validation

1. Health check: `curl -s https://ammawallet.com/api/v1/health`
2. Auth check: `curl -s -X POST https://ammawallet.com/api/v1/auth/login -d '{}' -H 'Content-Type: application/json'`
3. Trustline validation: `curl -s https://ammawallet.com/api/v1/trustlines/INVALID_KEY`
4. Container logs: `docker logs amma-api --tail 20`
5. Frontend check: `curl -s -o /dev/null -w "%{http_code}" https://ammawallet.com/`

## Rollback

```bash
cd ~/amma-wallet-docker
git -C /home/webadmin/web-stack/html/amma-wallet revert --no-commit HEAD
docker compose up -d --no-deps --build amma-api
```
