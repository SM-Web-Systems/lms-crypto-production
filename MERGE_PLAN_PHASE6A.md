# Phase 6A — Merge & Deploy Plan

> Branch: `fix/phase6a-quick-wins` → `main`
> Date: 2026-07-27
> Fixes: P0-1-F3, P0-3-F5, P0-3-F9, P0-3-F10 (1 HIGH, 3 MEDIUM)

---

## Pre-Merge Verification (on branch)

- [x] Backend tests: 382/382 passing
- [x] Frontend TypeScript: clean (`npx tsc --noEmit`)
- [x] No secrets in diff
- [x] FINDINGS.md updated for all 4 findings
- [x] FIX_PLAN_PHASE6A.md checkboxes complete

## Merge Commands

```bash
cd /home/webadmin/web-stack/html/amma-wallet

# 1. Switch to main
git checkout main

# 2. Merge with --no-ff to preserve individual commits
git merge --no-ff fix/phase6a-quick-wins -m "Merge Phase 6A quick wins (4 findings, +8 tests)"

# 3. Run tests on main
cd packages/backend && npx vitest run
cd ../..

# 4. Push to GitHub
source ~/.env.git-write
printf 'https://%s:%s@github.com\n' "$GIT_USER" "$GH_TOKEN" > ~/.git-credentials
git push origin main

# 5. Tag
git tag -a phase6a-complete-2026-07-27 -m "Phase 6A: 4 security fixes (P0-1-F3, P0-3-F5, P0-3-F9, P0-3-F10)"
git push origin phase6a-complete-2026-07-27
```

## Post-Merge Verification

- [ ] Backend tests: 382/382 passing on main
- [ ] No merge conflicts
- [ ] `git log --oneline -8` shows merge commit + 6 individual commits

## Rollback Plan

If anything goes wrong after merge:
```bash
git revert -m 1 <merge-commit-hash>
git push origin main
```

---

## Pre-Deploy Checklist

### Breaking Changes Assessment

| Change | Backward Compatible? | Notes |
|--------|---------------------|-------|
| `record.user_id` in auditLog (P0-1-F3) | Yes | Fixes a bug — was logging `undefined` before |
| decrypt-secret length validation (P0-3-F5) | Yes | Rejects invalid inputs that would have failed anyway |
| encryptedSecret stripped from localStorage (P0-3-F9) | **Needs attention** | Existing localStorage data retains old format. App will re-fetch from server on next login. No data loss — encryptedSecret is always re-derived from server sync. |
| Mnemonic removed from localStorage (P0-3-F10) | **Needs attention** | Existing `mnemonic_*` keys remain in localStorage until removeItem cleanup runs. HD derivation still works — mnemonic is re-encrypted and stored server-side. |

### localStorage Migration

- **encryptedSecret:** The partialize change means NEW persists won't include it. Existing localStorage entries with encryptedSecret are harmless — Zustand's rehydration will simply have extra data that gets stripped on next write.
- **Mnemonic:** Existing `mnemonic_*` keys in localStorage are NOT removed by this change. The existing `localStorage.removeItem` cleanup calls in wallet.ts still run and will clean them up during normal wallet operations.
- **No manual migration needed.** Both changes are backward-compatible.

### New Config/Env Vars

None. No new environment variables or configuration changes.

---

## Deployment Steps

```bash
# 1. Backend (API container)
cd /home/webadmin/amma-wallet-docker
docker compose build api
docker compose up -d --no-deps api

# 2. Frontend (static files)
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
npm run build
rsync -a --delete dist/ /var/www/html/amma-wallet/dist/

# 3. Verify containers
docker ps | grep amma
```

---

## Smoke Test Checklist

### 1. P0-1-F3: Audit Log Field Name
- [ ] Trigger email-based password reset flow
- [ ] Check audit_logs table: `SELECT * FROM audit_logs WHERE action='password_reset' ORDER BY created_at DESC LIMIT 5;`
- [ ] Verify `user_id` field is populated (not null/undefined)

### 2. P0-3-F5: Decrypt-Secret Length Validation
- [ ] From API: attempt to sign a transaction with a malformed/short encrypted blob
- [ ] Verify error response is immediate (not delayed by PBKDF2)
- [ ] Normal transaction signing still works with valid encrypted data

### 3. P0-3-F9: encryptedSecret Not in localStorage
- [ ] Open browser DevTools → Application → Local Storage → ammawallet.com
- [ ] Find the `amma-wallet` key, inspect JSON
- [ ] Verify `accounts[*].encryptedSecret` is NOT present in persisted data
- [ ] Verify wallet operations (send, receive) still work normally

### 4. P0-3-F10: Mnemonic Not in localStorage
- [ ] Open browser DevTools → Application → Local Storage → ammawallet.com
- [ ] Verify no `mnemonic_G*` keys exist (or if they do, they're from before the fix — will be cleaned up on next wallet operation)
- [ ] Verify HD wallet creation still works (create new HD wallet, confirm keypair generated)

---

## Post-Deploy Verification

- [ ] All 4 smoke tests pass
- [ ] No console errors in browser
- [ ] API health check: `curl -s https://ammawallet.com/api/v1/health | jq .`
- [ ] Monitor logs for 15 minutes: `docker logs amma-api --tail 50 --follow`
