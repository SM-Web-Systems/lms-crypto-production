# Backlog Batch 1 — Code Review Checklist

> Use after each fix commit and at end of batch.
> Reviewer: self-review + user approval

---

## Per-Fix Review (apply to each commit)

### Correctness
- [ ] Fix addresses the exact finding described in the spec
- [ ] Guard/validation logic is correct for all edge cases
- [ ] No off-by-one errors in comparisons
- [ ] Error messages are clear and non-leaking

### Scope Adherence
- [ ] Change is limited to the specified file(s)
- [ ] No hidden refactors or cleanup beyond the fix
- [ ] No frontend changes
- [ ] No stub module changes (Earn/Fiat/MoneyGram)

### TDD Compliance
- [ ] Test was written before implementation (for behavioral changes)
- [ ] Test confirmed to FAIL before fix
- [ ] Test confirmed to PASS after fix
- [ ] Full backend suite passes after fix

### Security
- [ ] No secrets added to source
- [ ] Logs do not leak sensitive data (userId, publicKey, tokens)
- [ ] Parameterized queries used (no string concatenation in SQL)
- [ ] No new `as any` casts that bypass type safety

### Documentation
- [ ] Commit message includes finding ID
- [ ] Commit message includes Co-Authored-By line
- [ ] Test file clearly documents what is being tested

### Revertability
- [ ] Fix can be reverted with `git revert` without side effects
- [ ] No migration or schema change that can't be reversed

---

## Fix-Specific Review Points

### Fix 7 (P0-3-F14): PII logging
- [ ] Only the 3 PII console.log lines removed
- [ ] Operational logs (fee bump, errors) preserved
- [ ] Admin liquifier log at line 2299 NOT removed (out of scope)

### Fix 8 (P2-4-F4): Config warning
- [ ] Uses `console.warn`, not `console.error` or `process.exit`
- [ ] Only triggers in production (`NODE_ENV === "production"`)
- [ ] Warning text mentions TURNSTILE_SECRET_KEY by name

### Fix 10 (P1-1-F4): Silent catch
- [ ] Still fire-and-forget (no throw)
- [ ] Uses `console.warn` (not error/throw)
- [ ] Logs `err.message`, not full error object

### Fix 1 (P2-3-F2): Division by zero
- [ ] Guards check `<= 0` AND `isNaN`
- [ ] Returns `"0"` (string), not `0` (number)
- [ ] Existing valid-input behavior unchanged
- [ ] `toFixed(2)` precision preserved

### Fix 2 (P2-3-F4): Quote validation
- [ ] Throws Error (not returns undefined)
- [ ] Error message is descriptive
- [ ] Guard is at method entry (before any Horizon call)
- [ ] Route handler catches and returns 400

### Fix 3 (P1-2-F4): Billing validation
- [ ] Uses `toStroops()` (not `parseFloat()`) for precision
- [ ] Checks `<= 0n` (bigint comparison)
- [ ] Throws Error with descriptive message
- [ ] Does NOT affect `writeBillingDebit` (separate function)

### Fix 6 (P2-2-F5): ILIKE escape
- [ ] Escapes `\` first, then `%`, then `_` (order matters)
- [ ] Caps query to 100 chars
- [ ] Slice applied before escape (not after)
- [ ] All 4 ilike() calls use the escaped query

### Fix 4 (P4-7-F2): Cache eviction
- [ ] Threshold is 100 (not 1000 — spec was updated)
- [ ] Eviction only removes entries with `windowStart` > 60s ago
- [ ] Eviction runs inside window-reset branch only
- [ ] Does not affect rate-limit counting logic

### Fix 5 (P0-1-F16): Token cleanup
- [ ] DELETE uses `user_id = ${userId}` (parameterized)
- [ ] DELETE appears BEFORE INSERT
- [ ] Does NOT affect initial registration token creation
- [ ] Rate limit (3/15min) still applies

### Fix 9 (P3-6-F5): DELETE 404
- [ ] **API contract confirmed with user before merge**
- [ ] Uses `(result as any).rowCount` — same pattern as PATCH handler
- [ ] 404 response schema added to route definition
- [ ] Error message matches PATCH handler style

---

## End-of-Batch Review

- [ ] Total test count: 387 + N new tests
- [ ] All backend tests pass
- [ ] All web-app tests pass
- [ ] No secrets in diff (`git diff main --stat`)
- [ ] FINDINGS.md updated (10 items marked FIXED)
- [ ] CUMULATIVE_STATUS.md updated (77 → 87)
- [ ] TODO_LOW_PRIORITY.md updated (items marked ✅)
- [ ] Each commit is independently revertable
- [ ] No production behavior regressions
