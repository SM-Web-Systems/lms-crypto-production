# Backlog Batch 2 — Code Review Checklist

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

### Fix 10 (P2-7-F4): userAgent audit capture
- [ ] Only auth-related call sites updated (auth.ts, server.ts, admin.ts)
- [ ] Uses `request.headers["user-agent"]` (standard Fastify access)
- [ ] Job/cron call sites NOT modified (no request object available)
- [ ] No change to auditLog() function signature

### Fix 9 (P4-7-F2): MemoryCache max size
- [ ] maxSize=500 (50x current deterministic key count)
- [ ] Evicts expired first, then oldest (insertion order)
- [ ] `set()` is the only method modified
- [ ] evict() method unchanged
- [ ] Correct finding ID: P4-7-F2 (MemoryCache), not P1-1-F5 (rateLimitWindows)

### Fix 5 (P1-3-F2): unsuspend() guard
- [ ] WHERE clause includes `suspensionReason IN ('debt_limit', 'maintenance_grace_expired')`
- [ ] `isNotNull(schema.tenants.suspendedAt)` added
- [ ] Admin manual unsuspend path NOT affected (separate handler)
- [ ] `inArray` imported from drizzle-orm

### Fix 3 (P2-2-F2): TOML URL validation
- [ ] `isValidImageUrl()` validates `https:` protocol only
- [ ] Applied to BOTH DB write paths (imageUrl and orgLogo)
- [ ] Uses `new URL()` constructor with try/catch
- [ ] Non-HTTPS URLs silently skipped (not thrown)

### Fix 4 (P2-2-F3): Icon max file size
- [ ] MAX_ICON_SIZE constant is 512 * 1024 (512KB)
- [ ] Both Content-Length and actual buffer.length checked
- [ ] Applied to BOTH download paths (resolveIcon and syncAllIcons)
- [ ] Oversized images skipped with `continue`, not thrown

### Fix 6 (P3-6-F4): Contacts rate limit
- [ ] All 4 endpoints have `config.rateLimit` (GET, POST, PATCH, DELETE)
- [ ] Rate: 30/minute per user
- [ ] Rate limit is per-endpoint, not shared

### Fix 7 (P3-8-F3): Push test rate limit
- [ ] Only `/push/test` rate-limited (not /subscribe or /unsubscribe)
- [ ] Rate: 5/15min
- [ ] Appropriately strict for fan-out endpoint

### Fix 8 (P3-9-F2): Curated seed auth + rate limit
- [ ] `preHandler: [authMiddleware]` added
- [ ] Rate: 3/hour
- [ ] Existing GET endpoint at `/tokens/curated` NOT affected
- [ ] No production automation known to call this endpoint unauthenticated

### Fix 1 (P2-1-F4): Trustline validation
- [ ] `StrKey.isValidEd25519PublicKey()` from `@stellar/stellar-sdk`
- [ ] Asset code regex: `^[a-zA-Z0-9]{1,12}$`
- [ ] All 5 endpoints validated (GET /:pk, GET /check, POST /add, POST /remove, POST /update-limit)
- [ ] Returns 400 with descriptive error (not 500)

### Fix 2 (P2-1-F5): Error sanitization
- [ ] All 5 catch blocks return "Internal server error" (not raw message)
- [ ] `console.warn` added for server-side debugging
- [ ] 404 handling preserved in catch blocks that have it
- [ ] No sensitive data in console.warn output

---

## End-of-Batch Review

- [ ] Total test count: 410 + N new tests
- [ ] All backend tests pass
- [ ] All web-app tests pass
- [ ] No secrets in diff (`git diff main --stat`)
- [ ] FINDINGS.md updated (10 items marked FIXED)
- [ ] CUMULATIVE_STATUS.md updated (86 → 96)
- [ ] TODO_LOW_PRIORITY.md updated (items marked ✅)
- [ ] Each commit is independently revertable
- [ ] No production behavior regressions
- [ ] P4-7-F2 finding ID correctly used (not P1-1-F5 mistake from Batch 1)
