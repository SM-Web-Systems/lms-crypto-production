# Phase 5 Merge & Pre-Deploy Plan

## Status: MERGED

- Merge commit: `35e18ee`
- Tag: `phase5-complete-2026-07-27`
- Tests: 377/377 passing on main
- Pushed to origin: YES

## Pre-Deploy Checklist

### New Environment Variables Required: NONE

Phase 5B added startup validation for existing vars (SSO_SECRET, ADMIN_JWT_SECRET, JWT_SECRET) but these are already set in production. No new env vars introduced.

### Config Validation Changes (Phase 5B — af098e9)

The following startup checks were added. If any fail, the server exits immediately:
- `SSO_SECRET` now in `requiredEnvVars` (was optional, already set in prod)
- `ADMIN_JWT_SECRET === JWT_SECRET` → FATAL exit (already different in prod)
- `SSO_SECRET === JWT_SECRET` → FATAL exit (already different in prod)
- All secrets must be >= 16 characters (already meet this in prod)

### Docker Rebuild Required: YES

```bash
cd /home/webadmin/amma-wallet-docker
docker compose build api
docker compose up -d --no-deps api
```

### Frontend Rebuild Required: YES (Send.tsx + Swap.tsx changes)

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
npm run build
rsync -a --delete dist/ /var/www/html/amma-wallet/dist/
```

## Post-Deploy Smoke Tests

1. Login with Turnstile — verify challenge works, login succeeds
2. 2FA code generation — verify 6-digit code (crypto.randomInt)
3. Logout — call without refreshToken, verify all sessions revoked
4. GET /wallets — verify no encryptedSecret in response
5. Wallet activate — verify correct wallet activates, others deactivate
6. Swap — verify single platform fee (backend only)
7. Send — enter invalid checksum address, verify rejection
8. Transaction signing — verify PIN required, no networkPassphrase accepted
9. Trustline POST — verify 429 after 10 rapid requests
10. Admin audit — perform credit, verify audit_log entry

## Rollback Plan

```bash
# Option 1: Revert merge commit
git revert -m 1 35e18ee
git push origin main
# Rebuild and redeploy

# Option 2: Reset to previous tag
git checkout audit-complete-2026-07-27
```
