# Complete Follow-Up Implementation Plan

**Date:** 2026-08-15
**Context:** Stellar SDK v16 post-release follow-up
**Branch:** `main` (documentation), dedicated worktree (NFT implementation)

---

## Task List

### T1 — Repository and Skill Discovery
- **Priority:** P0
- **Status:** COMPLETE
- **Objective:** Verify repo state, find skill files, confirm branch/worktree
- **Preconditions:** None
- **Files inspected:** `.superpowers/`, `docs/superpowers/`, `CLAUDE.md`, `skills/`, `AGENTS.md`
- **Files changed:** None
- **Tests:** N/A (read-only)
- **Steps:** Check git state, search for skills, report findings
- **Verification:** `git rev-parse HEAD` → `7427228`, branch=`main`, 9 untracked docs
- **Evidence:** HEAD=7427228, no `.claude/CLAUDE.md`, `.superpowers/sdd/` exists, `docs/superpowers/` has specs/plans/diagrams
- **Rollback:** N/A
- **Criteria:** All repo facts confirmed
- **Owner:** Automation-safe

### T2 — Inspect Untracked Documentation Files
- **Priority:** P0
- **Status:** COMPLETE
- **Objective:** Safety-review all 9 untracked docs for secrets, accuracy, false claims
- **Preconditions:** T1
- **Files inspected:** All 9 untracked files in `docs/superpowers/`
- **Files changed:** None (review only)
- **Tests:** N/A
- **Steps:** Read each file, check for credentials/PII/false claims/Mermaid validity
- **Verification:** Safety review report
- **Evidence:** All 9 files SAFE. Two minor issues found and fixed (NFT passphrase table, TODO "clean" claim)
- **Rollback:** N/A
- **Criteria:** No secrets, correct classifications, no false deployment/mint claims
- **Owner:** Documentation workstream

### T3 — Fix Documentation Issues
- **Priority:** P0
- **Status:** COMPLETE
- **Objective:** Correct the two minor issues found in T2
- **Preconditions:** T2
- **Files changed:**
  - `specs/2026-08-15-nft-testnet-verification-spec.md` — fixed passphrase table (mainnet was showing testnet passphrase)
  - `plans/2026-08-15-post-release-resumption-todo.md` — fixed "Working tree: clean" to "9 untracked documentation files"
- **Tests:** N/A (documentation only)
- **Verification:** Re-read corrected lines
- **Evidence:** Mainnet passphrase corrected to `Public Global Stellar Network ; September 2015`
- **Rollback:** Revert edits
- **Criteria:** Both issues resolved
- **Owner:** Documentation workstream

### T4 — Stage and Review Documentation Diff
- **Priority:** P0
- **Status:** IN PROGRESS
- **Objective:** Stage exactly the 9+1 documentation files, review staged diff
- **Preconditions:** T3
- **Files to stage:**
  1. `docs/superpowers/specs/2026-08-15-outbox-monitoring-closure-spec.md`
  2. `docs/superpowers/specs/2026-08-15-nft-testnet-verification-spec.md`
  3. `docs/superpowers/specs/2026-08-15-frontend-redeploy-runbook.md`
  4. `docs/superpowers/plans/2026-08-15-post-release-resumption-todo.md`
  5. `docs/superpowers/plans/2026-08-15-complete-followup-implementation-plan.md`
  6. `docs/superpowers/plans/2026-08-15-post-release-test-matrix.md`
  7. `docs/superpowers/diagrams/post-release-resumption-context.md`
  8. `docs/superpowers/diagrams/outbox-monitoring-closure-flow.md`
  9. `docs/superpowers/diagrams/frontend-redeploy-approval-flow.md`
  10. `docs/superpowers/diagrams/nft-testnet-verification-flow.md`
  11. `docs/superpowers/diagrams/post-release-test-flow.md`
  12. `docs/superpowers/diagrams/post-release-deployment-rollback.md`
  13. `docs/superpowers/diagrams/post-release-dependency-map.md`
- **Tests:** N/A
- **Verification:**
  ```bash
  git diff --cached --name-only
  git diff --cached --check
  git diff --cached --stat
  ```
- **Criteria:** Only docs staged, no secrets, no source code
- **Owner:** Documentation workstream

### T5 — Commit Documentation
- **Priority:** P0
- **Status:** READY FOR REVIEW
- **Objective:** Create one logical documentation commit
- **Preconditions:** T4 verified, explicit approval
- **Command:** `git commit -m "docs: complete post-release follow-up assessment"`
- **Verification:**
  ```bash
  git log -1 --oneline
  git show --stat --oneline HEAD
  git status --short
  ```
- **Criteria:** Commit created, only docs in diff, working tree clean
- **Owner:** Requires approval

### T6 — Frontend Redeploy Preflight
- **Priority:** P1
- **Status:** COMPLETE
- **Objective:** Verify all deployment prerequisites without deploying
- **Preconditions:** T1
- **Files inspected:** `docker-compose.yml`, container state
- **Files changed:** None
- **Steps:**
  1. `docker compose config --quiet` → exit 0
  2. `docker compose ps web` → running
  3. `docker inspect lms-web` → State.Running=true, image=lms-ammawallet-web
  4. `docker images` → new image `68ea5b1bc4d0` (built 2026-08-15 06:48)
  5. Running container image: SHA `414399394569` (rollback target)
- **Evidence:**
  - Compose config valid
  - Current container: `lms-web`, up 2 days, image SHA `414399394569`
  - New built image: `68ea5b1bc4d0` (2026-08-15 06:48 SAST)
  - Service target: `web`
  - No env or config changes needed
- **Criteria:** All preflight checks pass, rollback image identified
- **Owner:** Frontend workstream

### T7 — Frontend Production Redeploy
- **Priority:** P1
- **Status:** BLOCKED (awaiting explicit approval)
- **Objective:** Deploy TypeScript-fix frontend image
- **Preconditions:** T6 COMPLETE, explicit human approval
- **Command:**
  ```bash
  cd /home/webadmin/web-stack/html/LMS-AmmaWallet
  docker compose up -d --no-deps web
  ```
- **Post-deploy verification:**
  ```bash
  docker compose ps web
  docker inspect lms-web --format '{{json .State}}'
  docker inspect lms-web --format '{{.Config.Image}}'
  docker logs --since 5m lms-web 2>&1 | tail -50
  ```
- **Rollback:**
  ```bash
  # Tag current running image for rollback
  docker tag 414399394569 lms-ammawallet-web:pre-ts-fix
  # If rollback needed:
  docker run -d --name lms-web-rollback lms-ammawallet-web:pre-ts-fix
  ```
- **Criteria:** Container running with new image, no errors in logs
- **Owner:** Requires explicit approval

### T8 — NFT Testnet Configuration Design
- **Priority:** P2
- **Status:** IN PROGRESS
- **Objective:** Design minimal network parameterization for mintService.ts
- **Preconditions:** T1, NFT approach decision (TESTNET-FIRST selected)
- **Files inspected:**
  - `LMS-Server/src/services/mintService.ts`
  - `LMS-Server/src/__tests__/mint*.test.ts` (14 test files)
  - `LMS-Server/src/controllers/quizzesController.ts`
  - `LMS-Server/src/controllers/adminController.ts`
  - `LMS-Server/src/routes/nftApplications.ts`
- **Current state:**
  - Network passphrase hardcoded to `StellarSdk.Networks.PUBLIC` (lines 102, 209)
  - RPC URL defaults to `https://mainnet.sorobanrpc.com`
  - DB `network` column hardcoded to `'public'`
  - No testnet configuration exists
- **Design:** See NFT testnet verification spec
- **Owner:** NFT workstream

### T9 — Write Failing NFT Configuration Tests
- **Priority:** P2
- **Status:** NOT STARTED
- **Objective:** TDD: write failing tests for network parameterization
- **Preconditions:** T8, dedicated worktree created
- **Files to create:** `LMS-Server/src/__tests__/mint-network-config.test.ts`
- **Tests to write:**
  - Explicit testnet selection → testnet passphrase + testnet RPC
  - Explicit production selection → public passphrase + mainnet RPC
  - Missing `NFT_STELLAR_NETWORK` → fail closed (no mint)
  - Invalid network value → fail closed
  - Testnet contract ID ≠ production contract ID
  - Cross-network prevention
  - Idempotent duplicate request
  - Feature flag disabled blocks mint
- **Verification:** `cd LMS-Server && npx vitest run src/__tests__/mint-network-config.test.ts`
- **Expected:** All new tests FAIL (implementation not yet written)
- **Criteria:** Tests express correct behavior, all fail for right reasons
- **Owner:** NFT workstream

### T10 — Implement Minimal Network Parameterization
- **Priority:** P2
- **Status:** NOT STARTED (blocked by T9)
- **Objective:** Smallest change to support testnet/mainnet selection
- **Preconditions:** T9 tests written and failing
- **Files to change:**
  - `LMS-Server/src/services/mintService.ts` (add network selection logic)
  - Possibly `LMS-Server/src/config.ts` or new config helper
- **Design constraints:**
  - New env var: `NFT_STELLAR_NETWORK` (values: `public`, `testnet`)
  - Missing = fail closed (skip/throw, do not default to either)
  - Separate env vars: `NFT_CONTRACT_ID_TESTNET`, `NFT_CONTRACT_ID_PUBLIC` (or single with validation)
  - Record actual network in DB `nft_credentials.network`
  - No silent fallback
- **Verification:**
  ```bash
  cd LMS-Server && npx vitest run src/__tests__/mint-network-config.test.ts
  cd LMS-Server && npx vitest run
  cd LMS-Client && npx vitest run
  cd e2e && npx playwright test
  ```
- **Expected:** New tests pass, all 1091+206+14 existing tests still pass
- **Rollback:** Revert implementation, tests revert to failing
- **Criteria:** Network parameterization works, all tests green
- **Owner:** NFT workstream

### T11 — Self-Review
- **Priority:** P1
- **Status:** NOT STARTED
- **Preconditions:** T5, T7 (if approved), T10 (if implemented)
- **Objective:** Review all diffs for correctness, security, completeness
- **Owner:** Documentation workstream

### T12 — Request Independent Code Review
- **Priority:** P2
- **Status:** NOT STARTED
- **Preconditions:** T11
- **Objective:** Request human/tool review of NFT implementation changes
- **Owner:** Requires human

### T13 — Final Verification and Handoff
- **Priority:** P1
- **Status:** NOT STARTED
- **Preconditions:** All applicable tasks complete
- **Verification:**
  ```bash
  git status --short
  git log --oneline -5
  docker ps --filter name=lms --format "table {{.Names}}\t{{.Status}}"
  curl -s http://172.23.0.2:3001/health
  curl -s http://172.23.0.2:3001/healthz
  ```
- **Criteria:** All evidence recorded, no open issues without documented blockers
- **Owner:** Automation-safe

---

## Dependency Graph

```
T1 → T2 → T3 → T4 → T5 (commit, needs approval)
T1 → T6 → T7 (deploy, needs approval)
T1 → T8 → T9 → T10 → T11 → T12
T5, T7, T10 → T13
```

## Brainstorming Summary

### Documentation Commit Approaches
| Approach | Risk | Selected |
|----------|------|----------|
| A: Stage all 9+ files with `git add`, review diff, commit | Low — full review before commit | **YES** |
| B: Commit each file individually | Lower risk per commit but noisy history | No |
**Selected A:** Single logical commit with full pre-commit review.

### Frontend Redeploy Approaches
| Approach | Risk | Selected |
|----------|------|----------|
| A: Direct `docker compose up -d --no-deps web` | Simple, standard, matching MEMORY.md deploy pattern | **YES** |
| B: Tag images, blue-green swap, health-gate rollback | More complex, overkill for single-service TS-only fix | No |
**Selected A:** Direct compose up with `--no-deps`, matching established project deploy pattern.

### NFT Verification Approaches
| Approach | Risk | Selected |
|----------|------|----------|
| A: Testnet-first — parameterize network, test on testnet before production | Safe, isolated, reversible | **YES** |
| B: Production-opportunistic — wait for natural admin mint | No code change but no proactive verification | No |
**Selected A:** Per user decision — TESTNET-FIRST.

### Outbox Observability Approaches
| Approach | Risk | Selected |
|----------|------|----------|
| A: Retain existing `getOutboxStats()` + documented read-only SQL | Zero code change, adequate for current needs | **YES** |
| B: Expose redacted metrics via `/healthz` | Additional surface area, requires separate security review | No (P3 deferred) |
**Selected A:** No code change. P3 `/healthz` enhancement documented but NOT APPROVED.

### TDD Applicability
- **Outbox:** TDD not applicable — verified defect was incorrect monitoring query/documentation reference, not application behavior.
- **NFT:** TDD required — network parameterization is new application behavior requiring failing tests first.
