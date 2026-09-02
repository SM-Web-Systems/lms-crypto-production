# Backlog Batch 2 — Execution TODO

> Updated: 2026-07-28
> Branch: `fix/backlog-batch2`
> Tests: 410 → 453 (+43 new)

## Legend

- `[ ]` = todo
- `[~]` = in-progress
- `[x]` = done
- `[!]` = blocked / paused

---

## Setup

- [x] Create branch `fix/backlog-batch2` from `main`
- [x] Verify 410/410 tests pass on branch

---

## Fix 10: P2-7-F4 — Capture userAgent in audit log calls (zero risk)

- [x] Write source-assertion test (`audit-useragent.test.ts`)
- [x] Confirm test FAILS
- [x] Add `userAgent: request.headers["user-agent"]` to auth.ts call sites (9)
- [x] Add to server.ts call sites (2)
- [x] Add to admin.ts call sites (8)
- [x] Confirm test PASSES
- [x] Run full backend suite — 416/416
- [x] Commit — `9bc68a8`
- [x] Code review checkpoint

---

## Fix 9: P4-7-F2 — MemoryCache max size bound (zero risk)

- [x] Write unit test (`cache.test.ts`) — insert 501 entries, verify size capped
- [x] Confirm test FAILS
- [x] Add maxSize=500, evict-expired-first, then oldest
- [x] Confirm test PASSES
- [x] Run full backend suite — 419/419
- [x] Commit — `afb682e`
- [x] Code review checkpoint

---

## Fix 5: P1-3-F2 — unsuspend() defensive guard (very low risk)

- [x] Write source-assertion test (`auto-suspension-guard.test.ts`)
- [x] Confirm test FAILS
- [x] Add WHERE clause with suspensionReason guard
- [x] Confirm test PASSES
- [x] Run full backend suite — 424/424
- [x] Commit — `f8e8782`
- [x] Code review checkpoint

---

## Fix 3: P2-2-F2 — TOML image URL scheme validation (very low risk)

- [x] Write source-assertion test (`toml-sync-url.test.ts`)
- [x] Confirm test FAILS
- [x] Add `isValidImageUrl()` helper
- [x] Apply to both DB write paths
- [x] Confirm test PASSES
- [x] Run full backend suite — 428/428
- [x] Commit — `e5cc5e6`
- [x] Code review checkpoint

---

## Fix 4: P2-2-F3 — Icon download max file size (very low risk)

- [x] Write source-assertion test (`icon-resolver-size.test.ts`)
- [x] Confirm test FAILS
- [x] Add MAX_ICON_SIZE=512KB constant and size check
- [x] Apply to both download paths
- [x] Confirm test PASSES
- [x] Run full backend suite — 433/433
- [x] Commit — `4f52196`
- [x] Code review checkpoint

---

## Fix 6: P3-6-F4 — Rate limit contacts CRUD (low risk)

- [x] Write source-assertion test (`contacts-ratelimit.test.ts`)
- [x] Confirm test FAILS
- [x] Add `config.rateLimit` to all 4 contact endpoints
- [x] Confirm test PASSES
- [x] Run full backend suite — 436/436
- [x] Commit — `8486967`
- [x] Code review checkpoint

---

## Fix 7: P3-8-F3 — Rate limit /push/test (low risk)

- [x] Write source-assertion test (`push-ratelimit.test.ts`)
- [x] Confirm test FAILS
- [x] Add `config.rateLimit` to /push/test endpoint
- [x] Confirm test PASSES
- [x] Run full backend suite — 439/439
- [x] Commit — `9399368`
- [x] Code review checkpoint

---

## Fix 8: P3-9-F2 — Rate limit + auth on /curated/seed (low risk)

- [x] Write source-assertion test (`curated-tokens-auth.test.ts`)
- [x] Confirm test FAILS
- [x] Add `preHandler: [authMiddleware]` and `config.rateLimit`
- [x] Confirm test PASSES
- [x] Run full backend suite — 442/442
- [x] Commit — `70bb41d`
- [x] Code review checkpoint

---

## Fix 1: P2-1-F4 — Trustline input format validation (low risk)

- [x] Write unit tests (`trustlines-validation.test.ts`) — invalid publicKey → 400
- [x] Confirm test FAILS
- [x] Add `validateStellarPublicKey()` and `validateAssetCode()` helpers
- [x] Apply to all 5 trustline endpoints
- [x] Confirm test PASSES
- [x] Run full backend suite — 449/449
- [x] Commit — `b229a82`
- [x] Code review checkpoint

---

## Fix 2: P2-1-F5 — Error message sanitization (low risk)

- [x] Write source-assertion test (`trustlines-errors.test.ts`)
- [x] Confirm test FAILS
- [x] Replace `error.message` with "Internal server error" in 5 catch blocks
- [x] Add `console.warn` for logging
- [x] Confirm test PASSES
- [x] Run full backend suite — 453/453
- [x] Commit — `ede27e1`
- [x] Code review checkpoint

---

## Post-Batch

- [x] Run full backend test suite — 453/453
- [x] Run full web-app test suite — 23/23
- [x] Verify no secrets in diff
- [x] Update FINDINGS.md (10 items → FIXED)
- [x] Update CUMULATIVE_STATUS.md (86 → 96 fixed)
- [x] Update TODO_LOW_PRIORITY.md (items marked ✅)
- [x] Write checkpoint report
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

**No pause conditions were triggered during execution.**
