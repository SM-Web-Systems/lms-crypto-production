# W01-R1: Internal funding authorization and credit backing

Date: 2026-10-27 | Priority: P1 | Stage: S2-T01 (repair unit R1)
Source: `docs/release/SERVER-HANDOVER-W01-REVIEW-AND-REPAIR.md` at `223b262`
Base: `main` at `115d8c4f836a059aff733bb4cdeaabc9750963f2` (PR #104 merged)

## 1. Problem

PR #104 added a funding verification gate but left `platform_credit` and
`admin_grant` source types as pass-through (`break`) in both
`verifyFundingSourceSync` and `verifyFundingSourceAsync`
(`rewardFundingVerifier.ts:62-64, 110-114`).

All four fund routes (sponsor:275, parent:304, teacher:255, employer:331)
require only `reward.fund` permission. Any user with `reward.fund` can
fund a reward with `platform_credit` or `admin_grant` as the source type.
The ledger then credits the funder's available balance from nothing — no
`reward.manage` check, no independent-authorizer gate, no credit backing.

The reward foundation spec (section 5) requires:

- `admin_grant`: actor has `reward.manage`; actor ≠ reward creator; audit record
- `platform_credit`: actor has `reward.manage`; actor ≠ reward creator; credit
  balance backing

The previous W01 spec referenced `reward.admin_grant` which **does not exist**
in the RBAC seed data. The correct policy uses `reward.manage` (held by admin,
admin-2, super-admin) plus independent-authorizer enforcement.

## 2. Scope

**In scope (R1):**
- Enforce `reward.manage` for `platform_credit` and `admin_grant` in the shared
  verifier (covers all sync/async callers)
- Enforce actor ≠ reward creator (conflict-of-interest / self-enrichment)
- Fail closed for `platform_credit` — no credit provisioning mechanism exists;
  reject with `INSUFFICIENT_CREDIT`
- Audit evidence: ledger entries already record `actor_user_id` which IS the
  authorizer for internal funding — no new column needed
- Update all test fixtures that use self-grant `platform_credit`/`admin_grant`
  to use legitimate independent authorization
- RED/GREEN tests for every authorization gap

**Out of scope (tracked separately):**
- R2: Paystack amount/currency/ownership binding
- R3: Atomic reference consumption (race condition)
- Credit provisioning system for `platform_credit` (would be a new feature)
- A1-A3, A5 advisories from PR #104 review

## 3. Invariants

1. No reward receives `funded` status via `platform_credit` or `admin_grant`
   without a `reward.manage`-holding actor who is NOT the reward creator.
2. `platform_credit` fails closed with `INSUFFICIENT_CREDIT` until a credit
   provisioning mechanism is established.
3. `admin_grant` is the legitimate internal funding path when authorized by an
   independent admin.
4. External funding types (`stellar`, `paystack`) are unaffected by this change.
5. Existing funded rewards remain valid — no retroactive changes.
6. All test fixtures use legitimate funding (independent admin authorization or
   mocked external verification).

## 4. Authorization model

### Current (defective)

```
Route middleware: requirePermission('reward.fund')
         │
    fundRewardAsync(rewardId, actorId, source, key)
         │
    verifyFundingSourceAsync(source, rewardId)
         │
    platform_credit → break (pass-through)
    admin_grant     → break (pass-through)
         │
    DB transaction: credit funder.available from nothing
```

### Intended (R1 fix)

```
Route middleware: requirePermission('reward.fund')
         │
    fundRewardAsync(rewardId, actorId, source, key)
         │
    Lookup reward.creator_user_id
         │
    verifyFundingSourceAsync(source, rewardId, { actorId, creatorId })
         │
    platform_credit → require reward.manage
                    → require actorId ≠ creatorId
                    → check platform credit balance (FAIL CLOSED: none exists)
    admin_grant     → require reward.manage
                    → require actorId ≠ creatorId
                    → record audit evidence (authorizer = actorId)
         │
    DB transaction: credit funder.available (admin_grant only)
```

### Actors and permissions

| Actor Role | Has `reward.fund` | Has `reward.manage` | Can authorize internal? |
|-----------|-------------------|--------------------|-----------------------|
| sponsor | Yes | No | No |
| parent | Yes | No | No |
| teacher | Yes | No | No |
| employer | Yes | No | No |
| admin | Yes | Yes | Yes (if ≠ creator) |
| admin-2 | Yes | Yes | Yes (if ≠ creator) |
| super-admin | Yes | Yes | Yes (if ≠ creator) |

### Typical legitimate flow

1. Sponsor creates reward (creator = sponsor)
2. Sponsor requests internal funding
3. Route checks `reward.fund` — sponsor has it ✓
4. Verifier checks `reward.manage` — sponsor lacks it ✗
5. → Reject with 403 SCOPE_DENIED
6. Admin calls fund endpoint for the same reward
7. Route checks `reward.fund` — admin has it ✓
8. Verifier checks `reward.manage` — admin has it ✓
9. Verifier checks admin ≠ creator — admin ≠ sponsor ✓
10. `admin_grant` proceeds; `platform_credit` fails closed

## 5. API changes

### New error responses

| Code | HTTP | When |
|------|------|------|
| `SCOPE_DENIED` | 403 | Actor lacks `reward.manage` for internal source |
| `CONFLICT_OF_INTEREST` | 403 | Actor is the reward creator for internal source |
| `INSUFFICIENT_CREDIT` | 402 | `platform_credit` with no available balance |

### Existing responses (unchanged)

| Code | HTTP | When |
|------|------|------|
| `FUNDING_UNVERIFIED` | 402 | External source verification failed |
| `DUPLICATE_REFERENCE` | 409 | Reference reused across rewards |

## 6. Touched files

| File | Change |
|------|--------|
| `src/services/rewards/rewardFundingVerifier.ts` | Add authorization checks for internal sources; accept context parameter |
| `src/services/rewards/rewardService.ts` | Look up reward creator before calling verifier; pass context |
| `src/services/rewards/rewardErrors.ts` | Add `AUTHORIZATION_REQUIRED` if needed (reuse `SCOPE_DENIED` and `CONFLICT_OF_INTEREST`) |
| `src/__tests__/reward-internal-funding-auth.test.ts` | NEW: R1 security acceptance tests |
| `src/__tests__/reward-funding-verification.test.ts` | Update `platform_credit`/`admin_grant` tests to use legitimate authorization |
| `src/__tests__/reward-lifecycle.test.ts` | Update self-grant fixtures |
| `src/__tests__/reward-student-view.test.ts` | Update self-grant fixtures |
| `src/__tests__/reward-expiry-worker.test.ts` | Update self-grant fixtures |
| `src/__tests__/reward-eligibility.test.ts` | Update self-grant fixtures |
| `src/__tests__/reward-refund-admin.test.ts` | Update self-grant fixtures |
| `src/__tests__/reward-sponsor.test.ts` | Update self-grant fixtures (HTTP-level) |

## 7. Implementation plan

### Step 1: Extend verifier interface

Add optional `FundingAuthorizationContext` to both verifier entry points:

```typescript
export interface FundingAuthorizationContext {
  actorId: string;
  rewardCreatorId: string;
}
```

### Step 2: Add authorization checks in verifier

For `platform_credit` and `admin_grant` cases:
1. If no context provided → throw (defensive; service must always pass it)
2. Check `hasPermission(context.actorId, 'reward.manage')` → 403
3. Check `context.actorId !== context.rewardCreatorId` → 403 CONFLICT_OF_INTEREST
4. For `platform_credit` only: fail closed with INSUFFICIENT_CREDIT

### Step 3: Pass context from service

In `fundReward` and `fundRewardAsync`:
1. Look up reward via `getRewardRow(rewardId)` before verification
2. Pass `{ actorId, rewardCreatorId: reward.creator_user_id }` to verifier

### Step 4: Create test helper for legitimate funding

```typescript
function fundWithIndependentAdmin(rewardId: string, creatorId: string): RewardRow {
  const adminId = createUserWithRole('admin');
  return fundReward(rewardId, adminId, { type: 'admin_grant' }, `fund-${uuidv4()}`);
}
```

### Step 5: Update all test fixtures

Replace every `fundReward(rewardId, creatorId, { type: 'platform_credit' }, ...)` and
`fundReward(rewardId, creatorId, { type: 'admin_grant' }, ...)` where creator = funder
with the legitimate funding helper.

## 8. Test matrix

### R1 security acceptance tests (NEW — must be RED first)

| # | Test | Actor | Source | Expected | Current |
|---|------|-------|--------|----------|---------|
| 1 | Sponsor self-funds with platform_credit | sponsor (no reward.manage) | platform_credit | 403 SCOPE_DENIED | 200 ✗ |
| 2 | Sponsor self-funds with admin_grant | sponsor (no reward.manage) | admin_grant | 403 SCOPE_DENIED | 200 ✗ |
| 3 | Admin self-funds own reward with admin_grant | admin (creator = admin) | admin_grant | 403 CONFLICT_OF_INTEREST | 200 ✗ |
| 4 | Independent admin funds with admin_grant | admin (≠ creator, has manage) | admin_grant | 200 funded | 200 ✓ |
| 5 | Independent admin funds with platform_credit | admin (≠ creator, has manage) | platform_credit | 402 INSUFFICIENT_CREDIT | 200 ✗ |
| 6 | Revoked admin (manage removed) tries admin_grant | user (manage revoked) | admin_grant | 403 SCOPE_DENIED | 200 ✗ |
| 7 | External sources unaffected (stellar) | sponsor | stellar | 402 FUNDING_UNVERIFIED | 402 ✓ |
| 8 | External sources unaffected (paystack verified) | sponsor | paystack (mocked) | 200 funded | 200 ✓ |
| 9 | Audit evidence: authorizer recorded | admin (≠ creator) | admin_grant | actor_user_id = admin | N/A |
| 10 | Zero-credit platform_credit | admin (≠ creator) | platform_credit | 402 INSUFFICIENT_CREDIT | 200 ✗ |

### Existing test impact

| File | Tests affected | Action |
|------|---------------|--------|
| reward-funding-verification.test.ts | 2 (platform_credit, admin_grant pass-through) | Change to independent admin |
| reward-lifecycle.test.ts | 3 fixtures | Change to independent admin |
| reward-student-view.test.ts | 2 fixtures | Change to independent admin |
| reward-expiry-worker.test.ts | 6 fixtures | Change to independent admin |
| reward-eligibility.test.ts | 1 fixture | Change to independent admin |
| reward-refund-admin.test.ts | 1 fixture | Change to independent admin |
| reward-sponsor.test.ts | 2 HTTP fixtures | Change to independent admin |

## 9. Rollback

If this change causes regressions:
1. Revert the merge commit on main
2. The previous behavior (pass-through for internal sources) is restored
3. The authorization gap reverts to the state after PR #104
4. R1 remains open; repeat with corrected implementation

## 10. Mermaid diagrams

### Internal funding authorization sequence

```mermaid
sequenceDiagram
    participant S as Sponsor (creator)
    participant A as Admin (authorizer)
    participant API as Fund API
    participant V as FundingVerifier
    participant DB as SQLite

    Note over S,DB: Scenario A — Sponsor self-fund (REJECTED)
    S->>API: POST /fund { type: admin_grant }
    API->>V: verifyFundingSource({ actorId: sponsor })
    V->>V: hasPermission(sponsor, 'reward.manage') → false
    V-->>API: throw SCOPE_DENIED (403)
    API-->>S: 403 Insufficient permissions

    Note over S,DB: Scenario B — Independent admin (ACCEPTED)
    A->>API: POST /fund { type: admin_grant }
    API->>V: verifyFundingSource({ actorId: admin, creatorId: sponsor })
    V->>V: hasPermission(admin, 'reward.manage') → true
    V->>V: admin ≠ sponsor → true
    V-->>API: verified
    API->>DB: writeLedgerEntry(fund + reserve)
    API-->>A: 200 { status: funded }

    Note over S,DB: Scenario C — Admin funds own reward (REJECTED)
    A->>API: POST /fund { type: admin_grant } (creator = admin)
    API->>V: verifyFundingSource({ actorId: admin, creatorId: admin })
    V->>V: hasPermission(admin, 'reward.manage') → true
    V->>V: admin ≠ admin → false
    V-->>API: throw CONFLICT_OF_INTEREST (403)
    API-->>A: 403 Conflict of interest
```

### Denied-path rollback

```mermaid
flowchart TD
    A[fundRewardAsync called] --> B{Idempotency check}
    B -->|Duplicate| C[Return existing reward]
    B -->|New| D[verifyFundingSourceAsync]
    D -->|External source| E[External verification]
    D -->|Internal source| F{Has reward.manage?}
    F -->|No| G[throw SCOPE_DENIED 403]
    F -->|Yes| H{Actor ≠ Creator?}
    H -->|No| I[throw CONFLICT_OF_INTEREST 403]
    H -->|Yes| J{Source type?}
    J -->|admin_grant| K[Authorization verified]
    J -->|platform_credit| L{Platform credit balance?}
    L -->|None/insufficient| M[throw INSUFFICIENT_CREDIT 402]
    L -->|Sufficient| K
    K --> N[DB Transaction: fund + reserve]
    E -->|Verified| N
    E -->|Failed| O[throw FUNDING_UNVERIFIED 402]
    G --> P[No state change — reward stays draft]
    I --> P
    M --> P
    O --> P
    N --> Q[Reward status: funded]

    style G fill:#ffcdd2
    style I fill:#ffcdd2
    style M fill:#ffcdd2
    style O fill:#ffcdd2
    style Q fill:#c8e6c9
    style P fill:#fff9c4
```

### R1/R2/R3 to W02 dependency chain

```mermaid
flowchart TD
    W01_PR104[PR #104 merged: partial W01 fix] --> R1[W01-R1: Internal auth + backing]
    R1 --> R2[W01-R2: Paystack binding]
    R2 --> R3[W01-R3: Atomic reference consumption]
    R3 --> W01_CLOSE[W01 ACCEPTED]
    W01_CLOSE --> W02[W02: Cross-owner scope checks]

    R1 -.->|Cross-cutting: authorizer context| R2
    R1 -.->|Cross-cutting: fail-closed pattern| R3

    style W01_PR104 fill:#e8f5e9
    style R1 fill:#ffcdd2,stroke:#c62828,stroke-width:2px
    style R2 fill:#fff9c4
    style R3 fill:#fff9c4
    style W01_CLOSE fill:#e3f2fd
    style W02 fill:#e3f2fd
```

## 11. Acceptance criteria

- [ ] All 10 R1 security tests pass (were RED, now GREEN)
- [ ] No existing test regressions (1827+ pass count maintained)
- [ ] `platform_credit` fails closed in all paths
- [ ] `admin_grant` requires `reward.manage` + independent authorizer
- [ ] All test fixtures use legitimate funding
- [ ] Backend build succeeds (`npm run build`)
- [ ] Independent security review APPROVED
- [ ] Ledger correctly updated to PARTIALLY_FIXED with R1 done, R2/R3 outstanding
