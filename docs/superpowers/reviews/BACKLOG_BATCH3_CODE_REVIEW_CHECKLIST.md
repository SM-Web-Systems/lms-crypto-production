# Backlog Batch 3 — Code Review Checklist

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
- [ ] Logs do not leak sensitive data
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

### Fix 1 (P3-8-F1): Push subscription takeover
- [ ] `userId` NOT in onConflictDoUpdate `set` clause
- [ ] WHERE guard: `eq(pushSubscriptions.userId, user.id)` present
- [ ] Subscribe endpoint still creates new subscriptions correctly
- [ ] Existing tests for push endpoints still pass

### Fix 2 (P3-9-F1): Curated seed admin guard
- [ ] Admin role check present (request.admin or requireAdmin middleware)
- [ ] Regular authenticated user gets 403
- [ ] GET /tokens/curated remains public (no auth)
- [ ] Existing authMiddleware from Batch 2 NOT removed

### Fix 3 (P3-6-F3): Contacts PATCH injection
- [ ] `additionalProperties: false` in schema OR explicit destructure
- [ ] Legitimate PATCH updates (name, memo, memoType, notes) still work
- [ ] Injecting `userId` or `address` in body has no effect

### Fix 4 (P1-3-F3): Auto-suspension concurrency
- [ ] `isRunning` flag at module level (not inside function)
- [ ] `finally` block clears the flag (crash-safe)
- [ ] Second concurrent call returns early with log message
- [ ] Normal single execution still works end-to-end

### Fix 5 (P3-6-F2): Contacts address validation
- [ ] `StrKey.isValidEd25519PublicKey()` used (not just regex)
- [ ] Invalid address → 400 with descriptive error
- [ ] Valid G-addresses accepted
- [ ] StrKey imported from `@stellar/stellar-sdk`

### Fix 6 (P3-7-F11): Email code invalidation
- [ ] UPDATE marking old codes `used: true` appears BEFORE INSERT
- [ ] Applied at all 3 code-sending sites
- [ ] WHERE clause includes userId + type + used=false
- [ ] New code still inserted and valid after invalidation

### Fix 7 (P3-8-F4): Push subscription limit
- [ ] COUNT check before INSERT
- [ ] Limit is 10 subscriptions per user
- [ ] Returns 429 when limit exceeded
- [ ] Legitimate subscribe/unsubscribe cycle works within limits

### Fix 8 (P1-3-F1): acquisitionModeEnabled guard
- [ ] `acquisitionModeEnabled` check in enforceDebtLimit query
- [ ] Tenants with acquisitionModeEnabled=false not auto-suspended for debt
- [ ] Tenants with acquisitionModeEnabled=true still suspended correctly

### Fix 9 (P3-7-F10): TOTP window reduction
- [ ] `window: 1` at both verification sites (setup and disable)
- [ ] Not accidentally changed elsewhere

### Fix 10 (P0-2-F3): CREDIT_ROLES rename
- [ ] `PRIVILEGED_ROLES` defined, `CREDIT_ROLES` removed
- [ ] All usage sites updated (8+ references)
- [ ] No behavioral change (same array values)
- [ ] Existing admin tests pass unchanged

### Fix 11 (P0-1-F14): Password complexity [if included]
- [ ] Validator requires uppercase + lowercase + digit
- [ ] Applied at register, change-password, SMS password-reset
- [ ] Existing strong passwords pass validation
- [ ] Weak passwords ("password", "12345678") rejected
- [ ] Error message clearly states requirements

### Fix 12 (P1-2-F2): Billing TOCTOU [if included]
- [ ] `checkWalletBillingTx(tx, opts)` accepts transaction handle
- [ ] Uses `FOR UPDATE` on tenant billing row
- [ ] Outer pre-flight check still exists (fast-fail path)
- [ ] Existing billing tests pass unchanged
- [ ] Concurrent creation test passes

---

## End-of-Batch Review

- [ ] Total test count: 453 + N new tests
- [ ] All backend tests pass
- [ ] All web-app tests pass
- [ ] No secrets in diff (`git diff main --stat`)
- [ ] FINDINGS.md updated (N items marked FIXED)
- [ ] CUMULATIVE_STATUS.md updated
- [ ] TODO_LOW_PRIORITY.md updated (items marked ✅)
- [ ] Each commit is independently revertable
- [ ] No production behavior regressions
- [ ] Deferral gate documented if Fixes 11-12 skipped
