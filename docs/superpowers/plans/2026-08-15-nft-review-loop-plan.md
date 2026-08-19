# NFT Review — Safe /loop Plan

**Date:** 2026-08-15
**Purpose:** Automated loop execution plan for remaining verification tasks

---

## Loop Safety Rules

1. **READ-ONLY by default** — no source code changes without explicit approval
2. **No git push** — branch push requires separate human approval
3. **No Docker operations** — no container restarts or rebuilds
4. **No env changes** — no production or testnet environment modifications
5. **Stop on failure** — if any verification step fails, stop and report

---

## Loop Steps

### Step 1: Feature Branch Test Run (VERIFY-001)

**Action:** Run full backend test suite on feature branch worktree

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/.claude/worktrees/nft-testnet/LMS-Server && npx vitest run 2>&1 | tail -20
```

**Expected outcome:** 1108/1108 passed, 0 failed
**On success:** Record exact counts, proceed to Step 2
**On failure:** Stop. Record failing tests. Do NOT attempt fixes.

---

### Step 2: Diff Audit (VERIFY-003)

**Action:** Generate and review diff between main and feature branch

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet && git diff --stat main..feat/nft-testnet-network-configuration
```

**Expected outcome:** Only 2 files changed:
- `LMS-Server/src/services/mintService.ts`
- `LMS-Server/src/__tests__/mint-network-config.test.ts`

**On success:** Confirm clean diff, proceed to Step 3
**On failure:** Stop. Document unexpected files. Do NOT revert anything.

---

### Step 3: Full Diff Content Review

**Action:** Review the actual diff content for unintended changes

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet && git diff main..feat/nft-testnet-network-configuration
```

**Verification checklist:**
- [ ] No unrelated code changes
- [ ] No commented-out production code
- [ ] No debug statements left in
- [ ] No hardcoded secrets
- [ ] No TODO/FIXME without tracking
- [ ] Import changes are minimal and correct

**On success:** Proceed to Step 4
**On failure:** Stop. Document concerns.

---

### Step 4: NFT Config Test Isolation

**Action:** Run only the new NFT config tests to verify they pass independently

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/.claude/worktrees/nft-testnet/LMS-Server && npx vitest run src/__tests__/mint-network-config.test.ts
```

**Expected outcome:** 17/17 passed
**On success:** Proceed to Step 5
**On failure:** Stop. Record exact failures.

---

### Step 5: Existing Mint Test Verification

**Action:** Run existing mint tests to verify no regressions

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/.claude/worktrees/nft-testnet/LMS-Server && npx vitest run src/__tests__/mint
```

**Expected outcome:** All existing mint tests pass (24+ tests)
**On success:** Proceed to Step 6
**On failure:** Stop. This indicates a regression introduced by the feature branch.

---

### Step 6: Update Documentation

**Action:** Update test matrix and plan with actual results

**Files to update:**
- `docs/superpowers/plans/2026-08-15-nft-review-test-matrix.md` — fill in feature branch results
- `docs/superpowers/plans/2026-08-15-nft-review-and-release-plan.md` — update task statuses

**On success:** Proceed to Step 7
**On failure:** N/A (documentation updates should not fail)

---

### Step 7: Summary Report

**Action:** Output final summary with all verification results

**Template:**
```
## NFT Review Loop — Final Report

### Test Results
- Main branch: [X]/[X] PASS
- Feature branch: [X]/[X] PASS
- NFT config tests: [X]/17 PASS
- Existing mint tests: [X]/[X] PASS

### Diff Audit
- Files changed: [list]
- Unexpected changes: [none / list]
- Security concerns: [none / list]

### Status Updates
- VERIFY-001: [status]
- VERIFY-002: [status]
- VERIFY-003: [status]
- REVIEW-001: [status]

### Next Actions Required (Human)
1. [action]
2. [action]
```

---

## Loop Abort Conditions

The loop MUST stop immediately if any of these occur:

1. **Test failure on feature branch** — do not attempt to fix; report and stop
2. **Unexpected files in diff** — do not investigate further; report and stop
3. **Secrets found in diff** — do not proceed; report immediately
4. **Feature branch worktree is dirty** — do not proceed; report state
5. **Main branch has moved** — do not rebase; report and stop

---

## Post-Loop Actions (Human Required)

These actions are NOT part of the loop and require explicit human approval:

1. **Push feature branch** — `source ~/.env.git-write && git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git feat/nft-testnet-network-configuration`
2. **Create PR** — `gh pr create` with spec document links
3. **Request review** — assign reviewer on GitHub
4. **Merge** — after review approval
5. **Deploy** — `./scripts/deploy.sh` after merge
6. **Set env vars** — NFT_STELLAR_NETWORK=public in production

---

## Estimated Duration

| Step | Estimated Time |
|------|---------------|
| Step 1 (feature branch tests) | ~6 minutes |
| Step 2 (diff stat) | ~5 seconds |
| Step 3 (diff content) | ~30 seconds |
| Step 4 (NFT config tests) | ~10 seconds |
| Step 5 (mint tests) | ~15 seconds |
| Step 6 (doc updates) | ~1 minute |
| Step 7 (summary) | ~30 seconds |
| **Total** | **~8 minutes** |
