# W01-R3C: R3 correction — startup compatibility, reference identity, acceptance regressions

Date: 2026-10-28
Status: CORRECTION SPEC — IMPLEMENTED
Parent: W01-R3 (PR #108, merged at `7a23f88`)
Handover: `docs/release/SERVER-HANDOVER-W01-R3-PR108-REVIEW.md` at `0d304dd`

## Problem statement

PR #108 added a useful clean-database guard (partial UNIQUE index on `funding_reference`), but the independent review identified three implementation issues:

### R3-F1: Pre-R3 database rejected before upgrade (P1)

`databaseBootstrap.ts` derives expected key signatures from `schema.sql` at module load time. The R3 partial UNIQUE index is now in `schema.sql`, so the expected unique constraints for `reward_transactions` include the partial predicate signature. When `openApplicationDatabase()` opens a pre-R3 database, it calls `validateDatabase(inspection)` which calls `validateKeys()` for every table. The pre-R3 database lacks the new index, so startup exits before the migration can add it.

### R3-F2: Reference normalization disagrees with historical data (P2)

`normalizeReference()` trimmed all nonblank references before storage. The previous writer stored references verbatim. The UNIQUE index compares raw stored values. The spec says references are opaque — no trimming.

### R3-F3: Tests overstate coverage (P2)

Several tests used invalid IDs, generic assertions, or tested the wrong thing.

## Solution

### F1: `legacyUniqueExemptions` in `databaseBootstrap.ts`

Added a `legacyUniqueExemptions` set (matching `legacyForeignKeyExemptions` pattern) that exempts the R3 partial UNIQUE signature during pre-migration validation. Post-migration enforcement via `required-schema.json` indexes array.

### F2: Opaque reference identity

Changed `normalizeReference()` to: null/undefined → null, empty string → null, all other values → exact original. No trimming.

### F3: Corrected test assertions and new regressions

- T02/T06: valid existing reward IDs, specific `isFundingReferenceConstraintViolation` assertion
- T04: genuine rollback proof — reference freed after state-machine rejection
- T08: whitespace-only stored exactly (opaque identity), not normalized to NULL
- T11: real pre-R3 → R3 upgrade path on separate in-memory DB
- T12: real duplicate legacy references trigger migration abort with diagnostics
- T14 (new): opaque identity — exact storage, exact-match UNIQUE, distinct trimmed-vs-spaced
- T15 (new): pre-R3 database passes pre-migration validation (F1 exemption)
- T16 (new): `required-schema.json` includes R3 index

## Files changed

| File | Change |
|------|--------|
| `src/config/databaseBootstrap.ts` | `legacyUniqueExemptions` set + check in `validateKeys()` |
| `database/required-schema.json` | Added `idx_reward_txn_fund_ref_unique` to indexes |
| `src/services/rewards/rewardFundingVerifier.ts` | `normalizeReference()` — removed `.trim()` |
| `src/__tests__/reward-atomic-reference.test.ts` | Corrected T02-T12; added T14-T16 |
