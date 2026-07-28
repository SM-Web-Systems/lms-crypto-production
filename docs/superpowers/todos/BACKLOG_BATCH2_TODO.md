# Backlog Batch 2 — Execution TODO

> Updated: 2026-07-28
> Branch: `fix/backlog-batch2`
> Tests baseline: 410/410

## Legend

- `[ ]` = todo
- `[~]` = in-progress
- `[x]` = done
- `[!]` = blocked / paused

---

## Setup

- [ ] Create branch `fix/backlog-batch2` from `main`
- [ ] Verify 410/410 tests pass on branch

---

## Fix 10: P2-7-F4 — Capture userAgent in audit log calls (zero risk)

- [ ] Write source-assertion test (`audit-useragent.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `userAgent: request.headers["user-agent"]` to auth.ts call sites (10)
- [ ] Add to server.ts call sites (2)
- [ ] Add to admin.ts call sites (9)
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 9: P4-7-F2 — MemoryCache max size bound (zero risk)

- [ ] Write unit test (`cache.test.ts`) — insert 501 entries, verify size capped
- [ ] Confirm test FAILS
- [ ] Add maxSize=500, evict-expired-first, then oldest
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 5: P1-3-F2 — unsuspend() defensive guard (very low risk)

- [ ] Write source-assertion test (`auto-suspension-guard.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add WHERE clause with suspensionReason guard
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 3: P2-2-F2 — TOML image URL scheme validation (very low risk)

- [ ] Write source-assertion test (`toml-sync-url.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `isValidImageUrl()` helper
- [ ] Apply to both DB write paths
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 4: P2-2-F3 — Icon download max file size (very low risk)

- [ ] Write source-assertion test (`icon-resolver-size.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add MAX_ICON_SIZE=512KB constant and size check
- [ ] Apply to both download paths
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 6: P3-6-F4 — Rate limit contacts CRUD (low risk)

- [ ] Write source-assertion test (`contacts-ratelimit.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `config.rateLimit` to all 4 contact endpoints
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 7: P3-8-F3 — Rate limit /push/test (low risk)

- [ ] Write source-assertion test (`push-ratelimit.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `config.rateLimit` to /push/test endpoint
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 8: P3-9-F2 — Rate limit + auth on /curated/seed (low risk)

- [ ] Write source-assertion test (`curated-tokens-auth.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `preHandler: [authMiddleware]` and `config.rateLimit`
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 1: P2-1-F4 — Trustline input format validation (low risk)

- [ ] Write unit tests (`trustlines-validation.test.ts`) — invalid publicKey → 400
- [ ] Confirm test FAILS
- [ ] Add `validateStellarPublicKey()` and `validateAssetCode()` helpers
- [ ] Apply to all 5 trustline endpoints
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 2: P2-1-F5 — Error message sanitization (low risk)

- [ ] Write source-assertion test (`trustlines-errors.test.ts`)
- [ ] Confirm test FAILS
- [ ] Replace `error.message` with "Internal server error" in 5 catch blocks
- [ ] Add `console.warn` for logging
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Post-Batch

- [ ] Run full backend test suite
- [ ] Run full web-app test suite
- [ ] Verify no secrets in diff
- [ ] Update FINDINGS.md (10 items → FIXED)
- [ ] Update CUMULATIVE_STATUS.md (86 → 96 fixed)
- [ ] Update TODO_LOW_PRIORITY.md (items marked ✅)
- [ ] Write checkpoint report
- [ ] Recommend Batch 3 scope

---

## Pause Conditions

The loop MUST stop and ask for input if:
1. Any test fails after implementation
2. A fix exceeds 15 minutes
3. Line numbers don't match source
4. Regression detected in full suite
5. Spec/plan becomes invalid
6. Fix 8 curated-seed auth gate affects production automation
