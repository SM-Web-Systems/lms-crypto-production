# Enhanced Stellar Provider — Review & Hardening Plan

- **Status:** IN REVIEW
- **Date:** 2026-08-20
- **Spec:** `docs/superpowers/specs/2026-08-20-enhanced-provider-review-spec.md`

---

## Phases

### Phase 1: Write Failing Tests (TDD)

Write tests for all 6 hardening items before implementation.

- EP-H1: Concurrency guard (serialize duplicate mint requests)
- EP-H2: Bounded polling (3 attempts with backoff)
- EP-H3: Idempotency key (cache hit + 409 conflict)
- EP-H4: tx_hash overwrite protection
- EP-H5: Network isolation in reconciliation
- EP-H6: SUBMISSION_UNKNOWN error message format

**Files:** `LMS-Server/src/services/providers/__tests__/enhanced-provider.test.ts`
**Verify:** `cd LMS-Server && npx vitest run enhanced-provider` — new tests FAIL, existing EP-1–16 PASS.

### Phase 2: Implement Concurrency Guard

Add `Map<string, Promise>` lock to `mintNft()`.

**Files:** `LMS-Server/src/services/providers/enhancedStellarProvider.ts`
**Verify:** EP-H1 passes. EP-H7 passes (if written).

### Phase 3: Implement Bounded Polling

Replace single `getTransaction` call with 3-attempt loop.

- Production delays: `[1000, 2000, 4000]` ms
- Test delays: `[10, 20, 40]` ms (via constructor option or env check)

**Files:** `enhancedStellarProvider.ts`
**Verify:** EP-H2 passes.

### Phase 4: Implement Idempotency Key Check

Add in-memory `Map<string, { paramsHash, result }>` cache.

- Same key + same params = return cached result
- Same key + different params = throw 409 CONFLICT

**Files:** `enhancedStellarProvider.ts`
**Verify:** EP-H3 passes.

### Phase 5: Implement tx_hash Overwrite Protection

Change UPDATE query to include `AND tx_hash IS NULL` condition.

**Files:** `enhancedStellarProvider.ts`
**Verify:** EP-H4 passes.

### Phase 6: Implement Reconciliation Network Validation

Verify that network isolation is correct by design (Horizon URLs differ by network). Add explicit network match check as defense-in-depth.

**Files:** `enhancedStellarProvider.ts`
**Verify:** EP-H5 passes.

### Phase 7: Update SUBMISSION_UNKNOWN Handling

When poll exhausts without SUCCESS:
- Preserve tx_hash
- Set error message to `"SUBMISSION_UNKNOWN: transaction submitted but outcome unconfirmed. Reconciliation required. tx_hash: <hash>"`

**Files:** `enhancedStellarProvider.ts`
**Verify:** EP-H6 passes.

### Phase 8: Run Full Test Suite

```bash
cd LMS-Server && npx vitest run        # Backend (expect 1149+)
cd LMS-Client && npx vitest run        # Frontend (expect 206)
cd e2e && npx playwright test           # E2E (expect 14)
```

All must pass. Zero regressions.

### Phase 9: Code Review

- Review diff against spec.
- Verify no accidental provider activation.
- Verify no blockchain writes.
- Verify `NFT_PROVIDER` default remains `legacy`.

### Phase 10: Prepare Commit Approval

- Draft commit message.
- Update TODO list statuses.
- Request commit approval.

---

## Exit Criteria

- All EP-1–16 + EP-H1–H6 pass.
- Full backend + frontend + E2E suites pass.
- No provider activation. No blockchain writes.
- Commit approved and tagged.
