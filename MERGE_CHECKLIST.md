# Merge Checklist — audit/full-codebase-2026-07-26

## Audit Branch Commits (newest first)

### Phase 4 (2026-07-27)
```
62c323b fix(trustlines): P2-1-F1 — add authMiddleware to POST trustline routes
eda4a35 fix(billing): P1-2-F1 — replace floating-point with bigint string arithmetic
f2dda0a fix(nft): P3-1-F6 — require admin auth for NFT collection registration
965d2fa fix(nft): P3-1-F5 — add missing drizzle-orm imports in NFT transfer
d77dd7d fix(security): P4-2-F2 — remove secret key from trustline API helpers
f8ef771 fix(sso): P1-4-F3 — fail-closed when SSO_CALLBACK_WHITELIST is empty
ecbe6f5 fix(security): P1-1-F2 — timing-safe env-var API key comparison
a9ca4ab fix(test): repair earn.test.ts mock — use mockImplementation for constructor
```

### Phase 3 (2026-07-26)
```
84ecf9a docs: Phase 3 fix plan and FINDINGS.md updates
3846cc6 fix(nft): P3-1-F4/F6 — fix auditLog signatures in NFT routes
782a1f3 fix(2fa): P3-7-F3/F4 — timing-safe comparison + rate limiting
c448d04 fix(docker): P4-8-F3 — multi-stage build, exclude devDependencies
e86e974 fix(security): P2-2/P4-7-F5/F7 — add SSRF hostname validation
277c535 test(auth): P4-9-F1 — add critical-path auth route test suite
```

### Phase 2 (2026-07-26)
```
d8cb3a8 docs: Phase 2 fix plan and FINDINGS.md updates
a84468d fix(frontend): P4-2-F1 — remove localStorage token persistence (XSS protection)
132cdb5 fix(docker): P4-8-F2 — add non-root USER to Dockerfile
0e39157 fix(docker): P4-8-F1 — pin base image to digest (supply-chain protection)
45106ca fix(docker): P4-8-F4 — move DB password to Docker secrets (production)
625525e fix(config): validate TOTP_ENCRYPTION_KEY format at startup
baa690e fix(2fa): P3-7-F1 — encrypt TOTP secrets at rest with AES-256-GCM
```

### Phase 1 (2026-07-26)
```
d27b4eb docs: Phase 1 fix plan and FINDINGS.md updates
db0344b fix(seeds): P4-6-F1 — correct AQUA issuer address (55→56 chars)
ea29d54 fix(contacts): P3-6-F1 — use request.user!.userId instead of request.userId
746286d fix(moneygram): P3-5-F1/F2 — add authMiddleware to deposit/withdraw/transaction
9ec642c fix(earn): P3-2-F1/F2 — add authMiddleware to all earn routes
```

## Pre-Merge Steps

- [ ] Verify all tests pass: `cd packages/backend && npx vitest run` — expect 317+ tests, 0 failures
- [ ] Verify no secrets committed: `git diff main..HEAD -- '*.ts' '*.json' '*.env'` — scan for passwords/tokens
- [ ] Review PHASE4_SUMMARY.md for any deviations
- [ ] Review FINDINGS.md for correct FIXED markers
- [ ] Backup production DB: `docker exec amma-db pg_dump -U amma amma_wallet > /home/webadmin/backups/amma-pre-merge-$(date +%Y%m%d).sql`
- [ ] Check SSO_CALLBACK_WHITELIST in production env — must be non-empty after P1-4-F3 (fail-closed)
- [ ] Verify TOTP_ENCRYPTION_KEY is set in production env (from Phase 2 P3-7-F1)

## Merge Strategy

**Recommended: Merge commit** (`git merge --no-ff`)

Rationale:
- Preserves individual fix commits for `git bisect` capability
- Each commit references its finding ID for traceability
- The merge commit itself marks the audit boundary in history
- Alternative (squash) would lose the per-finding attribution

## Post-Merge Verification

### Smoke Test Checklist for ammawallet.com

- [ ] Login/register flow works
- [ ] 2FA setup/verify/disable works
- [ ] SSO redirect to LMS works (callback URL must be in whitelist)
- [ ] Wallet creation triggers billing event
- [ ] Trustline add/remove requires auth (should get 401 without token)
- [ ] Token search and portfolio display work
- [ ] Admin console accessible, collection registration requires admin auth
- [ ] Docker rebuild: `cd /home/webadmin/amma-wallet-docker && docker compose build && docker compose up -d`
- [ ] Frontend rebuild: `cd packages/web-app && npm run build && rsync -a --delete dist/ /var/www/html/amma-wallet/dist/`

### Monitoring (first 24h)

- [ ] Check `amma-monitor.sh` output — all 8 checks green
- [ ] Check `docker logs amma-api --tail 200` — no new errors
- [ ] Check billing events processing correctly
- [ ] Verify NFT transfer endpoint works (previously broken by missing imports)

## Rollback Plan

If critical issues are discovered post-merge:

```bash
# 1. Record current HEAD
git log --oneline -1

# 2. Reset to pre-merge state
git reset --hard <pre-merge-commit-hash>

# 3. Rebuild and redeploy
cd /home/webadmin/amma-wallet-docker && docker compose build && docker compose up -d
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npm run build && rsync -a --delete dist/ /var/www/html/amma-wallet/dist/

# 4. Verify rollback
curl -s https://ammawallet.com/api/v1/health | jq
```

The audit branch will remain available for cherry-picking individual fixes if needed.
