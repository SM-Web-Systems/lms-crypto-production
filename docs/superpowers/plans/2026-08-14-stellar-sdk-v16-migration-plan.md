# Stellar SDK v16 Migration Plan — 2026-08-14

## Prerequisites

- [x] Worktree created: `.claude/worktrees/stellar-sdk-upgrade`
- [x] Branch: `worktree-stellar-sdk-upgrade`
- [x] Base commit: `4e5c476`
- [x] Pre-upgrade inventory documented
- [x] Node 22 confirmed in Docker/CI/prod
- [x] All 17 API touchpoints inventoried
- [x] Migration spec written

## Phase 1: Pre-Upgrade Baseline (COMPLETED)

- [x] Backend tests: 1076/1076 pass
- [x] Frontend tests: 206/206 pass
- [x] TypeScript build: pass
- [x] npm audit: 2 high (axios via stellar-sdk — expected)
- [x] Worktree clean and isolated

## Phase 2: Regression Tests (COMPLETED)

- [x] Write `stellar-sdk-import.test.ts` — directly imports SDK and verifies 13 of 17 API touchpoints (remaining 4 require network state, covered by E2E/mocked tests)
- [x] Covers: namespace import, StrKey, rpc.Server, Keypair, Contract, TransactionBuilder, Networks, Address, scValToNative, rpc.Api, rpc.assembleTransaction
- [x] Verified test passes against SDK 15.1.0 (pre-upgrade): 15/15 pass

## Phase 3: Upgrade (COMPLETED)

- [x] `npm install @stellar/stellar-sdk@16.2.0`
- [x] Inspect `package.json` diff: single line `^15.1.0` → `^16.2.0`
- [x] Inspect `package-lock.json` diff: 443 lines (157+, 286−)
- [x] Verify resolved SDK version: exactly 16.2.0
- [x] Verify resolved axios version: 1.18.0
- [x] No `mintService.ts` changes required — all APIs stable

## Phase 4: Dependency Verification (COMPLETED)

- [x] `npm ls @stellar/stellar-sdk` → 16.2.0
- [x] `npm ls axios --all` → 1.18.0 (not 1.15.0)
- [x] `npm audit --omit=dev` → 0 vulnerabilities
- [x] No npm overrides or resolutions introduced
- [x] No lockfile deleted or regenerated

## Phase 5: Test Verification (COMPLETED)

- [x] SDK import regression test: 15/15 pass
- [x] Backend: 1091/1091 pass (1076 + 15 new)
- [x] Frontend: 206/206 pass
- [x] TypeScript build: `tsc --noEmit` exit 0
- [x] E2E: 14/14 pass
- [x] Docker build: `docker compose build api` exit 0

## Phase 6: Rollback Test (COMPLETED)

- [x] Revert package.json + package-lock.json via git stash
- [x] `npm ci` restores SDK 15.1.0
- [x] Baseline tests confirmed pass
- [x] Restored upgrade state: SDK 16.2.0

## Phase 7: Code Review and Release (IN PROGRESS)

- [x] `git diff --check` (no whitespace errors)
- [x] Scan for secrets in changed files — none found
- [x] Review package.json changes — single line
- [x] Review lockfile summary — 443 lines, natural resolution
- [x] Review mintService.ts — no changes (confirmed byte-identical)
- [x] Code review: Ready to merge (no critical issues)
- [ ] Commit with descriptive message
- [ ] Push branch
- [ ] Verify remote HEAD
- [ ] Create migration tag after all checks pass

## Rollback Procedure

```bash
# From worktree
git checkout HEAD~1 -- LMS-Server/package.json LMS-Server/package-lock.json
cd LMS-Server && npm ci
# Verify: npm ls @stellar/stellar-sdk → 15.1.0
# Verify: npx vitest run → 1076 pass
```

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| ESM/CJS import failure | Low | NodeNext handles dual exports; skipLibCheck=true |
| API incompatibility | Very Low | All 17 touchpoints verified stable in v16 |
| Transitive dep conflict | Low | npm ci resolves; lockfile captures exact versions |
| Node 22 engine check | None | All runtimes confirmed Node 22 |
| axios still vulnerable | Very Low | v16.2.0 depends on axios@1.18.0 explicitly |
