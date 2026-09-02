# Phase 6B — Merge & Deploy Plan

> Branch: `fix/phase6b-client-hd` → `main`
> Date: 2026-07-27
> Fixes: P0-3-F2 (HIGH), P2-4-F2 (MEDIUM)

---

## Pre-Merge Verification (on branch)

- [x] Backend tests: 387/387 passing
- [x] Frontend TypeScript: clean (`npx tsc --noEmit`)
- [x] Frontend build: success (`npm run build`)
- [x] No secrets in diff
- [x] FINDINGS.md updated for both findings

## Merge Commands

```bash
cd /home/webadmin/web-stack/html/amma-wallet
git checkout main
git merge --no-ff fix/phase6b-client-hd -m "Merge Phase 6B client-side HD derivation (P0-3-F2 + P2-4-F2, +5 tests)"
cd packages/backend && npx vitest run && cd ../..
source ~/.env.git-write
git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/amma-wallet-production.git main
git tag -a phase6b-complete-2026-07-27 -m "Phase 6B complete — all Phase 6 findings resolved"
git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/amma-wallet-production.git phase6b-complete-2026-07-27
```

## Rollback Plan

```bash
git revert -m 1 <merge-commit-hash>
git push origin main
cd /home/webadmin/amma-wallet-docker && docker compose build amma-api && docker compose up -d --no-deps amma-api
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npm run build && rsync -a --delete dist/ /home/webadmin/web-stack/html/amma-wallet/dist/
```

---

## Pre-Deploy Checklist

### Breaking Changes Assessment

| Change | Backward Compatible? | Notes |
|--------|---------------------|-------|
| Client-side HD derivation (P0-3-F2) | Yes | Same BIP39/SEP-0005 derivation path, identical keypairs |
| Removed `/keypair/from-mnemonic` endpoint | **Check LMS** | LMS uses `keypairApi.generate()` NOT `fromMnemonic` — safe |
| Removed `/keypair/validate-mnemonic` endpoint | **Check LMS** | LMS doesn't validate mnemonics — safe |
| Production crash on empty secrets (P2-4-F2) | Yes | Only in `NODE_ENV=production`; both secrets are set in `app.env` |

### Integration Check

- **LMS integration:** Uses `keypairApi.generate()` (random keypair) for wallet creation. Does NOT use `fromMnemonic` or `validateMnemonic`. Confirmed by code review. **No impact.**
- **Frontend:** Updated simultaneously — calls `deriveHDKeypair()` locally instead of server endpoints.

### Existing Wallets

No impact. Existing wallets have `publicKey` + `encryptedSecret` stored in the database — they don't need to be re-derived.

---

## Deployment Steps

```bash
# 1. Backend
cd /home/webadmin/amma-wallet-docker
docker compose build amma-api && docker compose up -d --no-deps amma-api

# 2. Frontend
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
npm run build && rsync -a --delete dist/ /home/webadmin/web-stack/html/amma-wallet/dist/

# 3. Verify
docker ps | grep amma-api
curl -s https://ammawallet.com/api/v1/health | jq .
```

---

## Smoke Test Checklist

### 1. HD Derivation (Client-Side)
- [ ] Verify deployed frontend JS contains `deriveHDKeypair` function
- [ ] Verify NO references to `/keypair/from-mnemonic` in deployed JS

### 2. Mnemonic Validation (Client-Side)
- [ ] Verify deployed frontend JS contains `isValidMnemonic` function
- [ ] Verify NO references to `/keypair/validate-mnemonic` in deployed JS

### 3. Removed Endpoints Return 404
- [ ] `curl -s -o /dev/null -w "%{http_code}" -X POST https://ammawallet.com/api/v1/keypair/from-mnemonic` → expect 404
- [ ] `curl -s -o /dev/null -w "%{http_code}" -X POST https://ammawallet.com/api/v1/keypair/validate-mnemonic` → expect 404

### 4. Production Secrets Validation
- [ ] Container starts without FATAL errors in logs
- [ ] API health check returns 200
