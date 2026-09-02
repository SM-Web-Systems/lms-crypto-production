# Phase 6 — Readiness Checklist

> Complete all items before starting Phase 6 implementation.
> Reference: `PHASE6_PLAN.md` for track details, `PHASE6_RISK_ASSESSMENT.md` for exploit scenarios.

## Pre-Implementation Prerequisites

### Environment & Backup
- [ ] Back up production database: `docker exec amma-db pg_dump -U stellarwallet stellarwallet > backup_pre_phase6_$(date +%Y%m%d).sql`
- [ ] Verify backup is restorable (test on amma-db-testnet)
- [ ] Confirm production `app.env` contains `PLATFORM_SECRET` (non-empty)
- [ ] Confirm production `app.env` contains `SIGNING_SECRET_KEY` (non-empty)
- [ ] Note current test count: ___/377 (should be 377/377)

### Branch Strategy
- [ ] Create branch `fix/phase6a-quick-wins` from `main` (Tracks 1+2)
- [ ] Plan separate branch `fix/phase6c-client-storage` for Track 3
- [ ] Plan separate branch `feat/phase6d-client-hd-derivation` for Track 4

### Dedicated Time Blocks
- [ ] **Phase 6A+6B (Tracks 1+2):** ~2 hours — quick wins + input validation
- [ ] **Phase 6C (Track 3):** ~4 hours — localStorage hardening, requires manual testing of full wallet creation/unlock/send flows
- [ ] **Phase 6D (Track 4):** 3-5 days — crypto refactor, requires dedicated planning session, LMS integration testing, staging environment

### Track 4 (Crypto Refactor) — Additional Prerequisites
- [ ] Review `bip39` / `@scure/bip39` browser compatibility for target browsers
- [ ] Review `ed25519-hd-key` / `@scure/bip32` bundle size impact
- [ ] Plan migration path for existing wallets created via server-side `/api/v1/keypair/from-mnemonic`
- [ ] Coordinate with LMS integration — `walletService.ts` 3-step flow may need updates
- [ ] Test on amma-api-testnet before production deployment

### Deploy Readiness
- [ ] Docker compose build command ready: `cd /home/webadmin/amma-wallet-docker && docker compose build amma-api && docker compose up -d --no-deps amma-api`
- [ ] Frontend build command ready: `cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npm run build && rsync -a --delete dist/ /home/webadmin/web-stack/html/amma-wallet/dist/`
- [ ] Rollback plan documented (revert to `phase5-complete-2026-07-27` tag)

## Phase 6 Execution Order

1. **Phase 6A** — Track 1 (Quick Wins): P0-1-F3, P0-4-F1, P2-4-F2
2. **Phase 6B** — Track 2 (Input Validation): P0-3-F5
3. **Phase 6C** — Track 3 (Client Storage): P0-3-F10, P0-3-F9
4. **Phase 6D** — Track 4 (Crypto Refactor): P0-3-F2

## Rollback Plan

```bash
# Revert to Phase 5 baseline
git checkout phase5-complete-2026-07-27
cd /home/webadmin/amma-wallet-docker && docker compose build amma-api && docker compose up -d --no-deps amma-api
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npm run build && rsync -a --delete dist/ /home/webadmin/web-stack/html/amma-wallet/dist/
```
