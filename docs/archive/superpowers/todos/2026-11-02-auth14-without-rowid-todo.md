# AUTH-14-WR: WITHOUT ROWID Orphan Preservation — Iterative TODO

> Created: 2026-11-02  
> Branch: `codex/auth14-without-rowid-20261102`  
> Base SHA: `69c2f1da5bb4c622d9a8a2ee7a6285a560c8ba9e` (main, AUTH-14 merged)  
> Status: Implementation complete; CI and review pending

---

## Tool / Skill Availability

| Tool | Status |
|------|--------|
| Superpowers (all skills) | ✅ installed `/home/webadmin/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/` |
| Ripwire | ✅ `/home/webadmin/.local/bin/ripwire` |
| Ponytail | ❌ not found |
| Caveman | ❌ not found |

---

## Phase 0 — Assessment (complete)

- [x] **A1** Read AUTH-14-WITHOUT-ROWID-REMEDIATION-PROMPT.md at commit `9feae922e49efde82d55e9894bc9143263d0bad8`
- [x] **A2** Verify main HEAD is `69c2f1da` (AUTH-14 squash merge) ✓
- [x] **A3** Read `migrateRewardTxnCheck.ts` on main — identified orphan snapshot loop at lines 618–630
- [x] **A4** Read full `reward-txn-check-migration.test.ts` — 118 tests, identified existing receipt-trigger tests
- [x] **A5** Check for existing WR PRs — none found; no duplicate
- [x] **A6** Confirm local environment: Node v20.20, vitest 4.1.12, symlinked node_modules from auth14-clean-ci
- [x] **A7** Set up isolated git worktree at `/home/webadmin/auth14-without-rowid` from `origin/main` on branch `codex/auth14-without-rowid-20261102`
- [x] **A8** Verify baseline: 118 tests pass, `tsc --noEmit` clean

---

## Phase 1 — Root Cause Analysis (complete)

- [x] **R1** Gap 1 identified: `if (v.rowid !== null)` silently skips WITHOUT ROWID violations; null rowid case never snapshotted
- [x] **R2** Gap 2 identified: `row === undefined ? '' : JSON.stringify(row)` stores `''` when `WHERE rowid = ?` fails (alias shadowing); pre- and post-snapshots both `''` → mutation invisible
- [x] **R3** Confirmed fix approach: fail closed for both cases (null rowid + undefined lookup)
- [x] **R4** Confirmed `_rowid_`/`oid` shadowing NOT a bug with `WHERE rowid = ?` (rowid alias still works when only `_rowid_` or `oid` is shadowed)

---

## Phase 2 — TDD Regression Tests (complete)

- [x] **T1** Write 10 new tests (WR-1 to WR-10) in `reward-txn-check-migration.test.ts`
  - [x] WR-1 [REGRESSION]: WITHOUT ROWID + trigger → currently succeeds (bug)
  - [x] WR-2: WITHOUT ROWID, no trigger → fail closed required
  - [x] WR-3: Rollback verification after WR refusal
  - [x] WR-4 [REGRESSION]: rowid-alias-shadowed + trigger → currently succeeds (bug)
  - [x] WR-5: rowid-alias-shadowed, no trigger → fail closed required
  - [x] WR-6: `_rowid_`-shadowed + trigger → GREEN (trigger detection correct, no regression)
  - [x] WR-7: `oid`-shadowed + trigger → GREEN (trigger detection correct, no regression)
  - [x] WR-8: Mixed null + non-null rowid violations → fail closed required
  - [x] WR-9: Ordinary rowid orphan still migrates → GREEN (baseline preserved)
  - [x] WR-10: BLOB mutation detected → GREEN (correct behavior preserved)
- [x] **T2** Verify RED: WR-1,2,3,4,5,8 fail for right reasons on unmodified code
- [x] **T3** Verify GREEN: WR-6,7,9,10 pass on unmodified code (existing correct behavior)

---

## Phase 3 — Implementation (complete)

- [x] **I1** Implement minimal fix in `migrateRewardTxnCheck.ts` orphan snapshot loop (lines 618–630):
  - Replace `if (v.rowid !== null)` with fail-closed check for null rowid (WITH ROWID error)
  - Replace `row === undefined ? '' : ...` with fail-closed check for undefined lookup (alias error)
  - Remove the `if (v.rowid !== null)` conditional entirely (fail closed before snapshotting)
- [x] **I2** Verify all 10 new tests pass (GREEN)
- [x] **I3** Verify no regressions: 128 migration tests pass (118 + 10), `tsc --noEmit` clean
- [x] **I4** Verify full suite: 2311/2311 TypeScript tests pass (194 test files)

---

## Phase 4 — Artifacts (complete)

- [x] **D1** Write spec: `docs/superpowers/specs/2026-11-02-auth14-without-rowid-spec.md`
- [x] **D2** Write todo: `docs/superpowers/todos/2026-11-02-auth14-without-rowid-todo.md` (this file)
- [x] **D3** Write diagram: `docs/superpowers/diagrams/2026-11-02-auth14-without-rowid-orphan-flow.md`

---

## Phase 5 — Review and CI (in progress)

- [ ] **V1** Independent code/security review (subagent)
- [ ] **V2** Check PR diff for private data
- [ ] **V3** Create PR: `codex/auth14-without-rowid-20261102` → `main`
- [ ] **V4** CI pass on PR head (all 4 jobs: Backend Tests, Frontend Tests & Build, Offline Monitoring and Restore, E2E Tests)
- [ ] **V5** Merge when all gates pass

---

## Evidence Index

| Artifact | Notes |
|----------|-------|
| `LMS-Server/src/scripts/migrateRewardTxnCheck.ts` | Orphan loop fix (lines ~622–656) |
| `LMS-Server/src/__tests__/reward-txn-check-migration.test.ts` | 10 new WR tests (lines ~2534–2820) |
| `docs/superpowers/specs/2026-11-02-auth14-without-rowid-spec.md` | Full spec |
| `docs/superpowers/diagrams/2026-11-02-auth14-without-rowid-orphan-flow.md` | Updated sequence diagram |

---

## Production Gates (unchanged from AUTH-14 merge — not modified by this fix)

This fix does not change the production deployment gates from AUTH-14. The fail-closed behavior applies only to WITHOUT ROWID and rowid-alias-shadowed tables, neither of which is present in the known production FK violation (ordinary rowid table).
