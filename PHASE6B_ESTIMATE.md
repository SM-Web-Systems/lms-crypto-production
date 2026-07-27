# Phase 6B — Effort Estimate

> P0-3-F2 (HIGH) + P2-4-F2 (MEDIUM) | Total: ~1 day

---

## Task Breakdown

| # | Task | Hours | Dependencies |
|---|------|------:|-------------|
| 1 | Create `hd-wallet.ts` + unit tests (known vectors, invalid input) | 1.0 | None |
| 2 | Modify `wallet.ts` — replace 3 `keypairApi` calls with local derivation | 1.0 | Task 1 |
| 3 | Update `api.ts` — remove `fromMnemonic` + `validateMnemonic` methods | 0.25 | Task 2 |
| 4 | Remove backend endpoints (`from-mnemonic`, `validate-mnemonic`) in server.ts | 0.5 | Task 2 |
| 5 | Source-assertion tests (verify no server mnemonic calls remain) | 0.5 | Tasks 2-4 |
| 6 | P2-4-F2: Crash on empty PLATFORM_SECRET/SIGNING_SECRET_KEY + test | 0.25 | None |
| 7 | TypeScript checks + full test suite (both packages) | 0.5 | All above |
| 8 | Manual smoke tests (5-item checklist) | 1.0 | Task 7 |
| 9 | FINDINGS.md + documentation updates | 0.25 | Task 8 |
| **Total** | | **5.25** | |

## Timeline

| Block | Duration | Tasks |
|-------|---------|-------|
| Morning | 3 hours | Tasks 1-5 (core refactor + tests) |
| Afternoon | 2.25 hours | Tasks 6-9 (bonus fix, verification, docs) |
| **Total** | **~1 day** | |

## Why 1 Day Instead of 3-5?

The original 3-5 day estimate in PHASE6_PLAN.md assumed:
- New crypto library integration (NOT needed — `stellar-hd-wallet` and `bip39` already installed)
- Complex client-side crypto (NOT needed — just calling `StellarHDWallet.fromMnemonic()`)
- Database migration (NOT needed — stored data format is unchanged)
- LMS integration testing (NOT needed — LMS uses `keypairApi.generate()`, not `fromMnemonic`)

The actual work is: move 3 API calls from server-side to client-side, using a library that's already bundled.

## Dependencies

- No external dependencies
- No infrastructure changes
- No database migrations
- No LMS coordination needed
