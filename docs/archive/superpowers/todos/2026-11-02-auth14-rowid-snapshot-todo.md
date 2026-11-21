# AUTH-14-RS: Rowid Snapshot Guard — Iterative TODO

> Created: 2026-11-02  
> Branch: `codex/auth14-rowid-snapshot-fix`  
> Candidate commit: `824f5d89885b094d1d39d2d63bb47783c0b2bd29`  
> Base SHA: `7f290caa39c190b6093c6bd1a10b35dffaa44426` (main, AUTH-14-WR)  
> Status: Independent review in progress; CI pending

---

## Tool / Capability Availability

| Tool | Status |
|------|--------|
| Superpowers (all skills) | ✅ installed `/home/webadmin/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/` |
| Ripwire | ✅ `/home/webadmin/.local/bin/ripwire` (0.5.0) |
| Ponytail | ❌ not found — reported; proceeding without |
| Caveman | ❌ not found — reported; proceeding without |

---

## Phase 0 — Assessment (complete)

- [x] **A1** Read AUTH-14-ROWID-SNAPSHOT-SERVER-PROMPT.md at commit `6843a427f76dbbd11b0e10f6a06471612a659107`
- [x] **A2** Identify candidate commit `824f5d89885b094d1d39d2d63bb47783c0b2bd29`, base `7f290caa`
- [x] **A3** Fetch full candidate diff (35+30- in migration, 93+0 in tests)
- [x] **A4** Read AUTH-14-ROWID-SNAPSHOT-SAFETY.md from candidate commit
- [x] **A5** Verify no existing PR for this branch
- [x] **A6** Confirm local environment: Node v20.20.0, vitest 4.1.12, symlinked node_modules from auth14-clean-ci
- [x] **A7** Create isolated git worktree `/home/webadmin/auth14-rowid-snapshot` at branch tip
- [x] **A8** Confirm `tsc --noEmit` clean on candidate

---

## Phase 1 — Root Cause Analysis (complete)

- [x] **R1** Gap 3: shadowed `rowid` column returns a *different* existing row — previous fix only caught `undefined` return; does not catch same-name different-value collision
- [x] **R2** Gap 4: `JSON.stringify(row)` as object uses JS `number` for SQLite INTEGER — precision lost for values > `Number.MAX_SAFE_INTEGER`; adjacent 64-bit integers compare equal
- [x] **R3** Gap 5: orphan snapshot only covers FK-violating rows; receipt trigger mutating unrelated rows is invisible to the guard
- [x] **R4** Candidate fix approach verified: upfront `pragma_table_xinfo` rowid check + `snapshotOrphanRow()` with `.safeIntegers(true).raw(true)` + receipt trigger inventory inside BEGIN IMMEDIATE

---

## Phase 2 — RED Verification (complete)

- [x] **RV1** Scenario A (shadowed collision): confirmed RED on pre-fix base (7f290caa) — `applyUpgrade` succeeds; trigger mutation invisible
- [x] **RV2** Scenario B (unrelated row trigger): confirmed RED on pre-fix base — migration succeeds; unrelated row mutated silently
- [x] **RV3** Scenario C (64-bit integer mutation): confirmed RED on pre-fix base — migration succeeds; 64-bit mutation invisible via `JSON.stringify`

---

## Phase 3 — Test Execution (complete)

- [x] **T1** Migration test suite: 135/135 pass on candidate (6 new RS tests + 129 prior)
- [x] **T2** Full backend suite: 2318/2318 TypeScript tests pass (194 test files)
- [x] **T3** TypeScript build: `tsc --noEmit` clean on candidate

---

## Phase 4 — Artifacts (complete)

- [x] **D1** Write spec: `docs/superpowers/specs/2026-11-02-auth14-rowid-snapshot-spec.md`
- [x] **D2** Write todo: `docs/superpowers/todos/2026-11-02-auth14-rowid-snapshot-todo.md` (this file)
- [x] **D3** Write diagram: `docs/superpowers/diagrams/2026-11-02-auth14-rowid-snapshot-flow.md`

---

## Phase 5 — Review and CI (in progress)

- [ ] **V1** Independent code/security review (Opus subagent) — IN PROGRESS
- [ ] **V2** Apply review findings; iterate if findings require changes
- [ ] **V3** Check PR diff for private data
- [ ] **V4** Create PR: `codex/auth14-rowid-snapshot-fix` → `main` (candidate only, not docs commit)
- [ ] **V5** CI pass on PR head (all 4 jobs: Backend Tests, Frontend Tests & Build, Offline Monitoring and Restore, E2E Tests)
- [ ] **V6** Merge when all gates pass
- [ ] **V7** Verify resulting main SHA and post-merge CI

---

## Evidence Index

| Artifact | Notes |
|----------|-------|
| `LMS-Server/src/scripts/migrateRewardTxnCheck.ts` | `snapshotOrphanRow()` (new fn), rowid alias check, trigger inventory |
| `LMS-Server/src/__tests__/reward-txn-check-migration.test.ts` | 6 new RS tests (RS-1 to RS-6) at end of file |
| `docs/release/AUTH-14-ROWID-SNAPSHOT-SAFETY.md` | Operator safety reference |
| `docs/superpowers/specs/2026-11-02-auth14-rowid-snapshot-spec.md` | Full spec |
| `docs/superpowers/diagrams/2026-11-02-auth14-rowid-snapshot-flow.md` | Updated flow diagrams |

---

## Production Gates (beyond CI)

**Not verified by regression suite — must be confirmed before deployment:**
1. Production database has no `system_config` triggers
2. No FK-violating child table has a column named `rowid`
3. Protected-copy rehearsal with exact candidate and rollback images completed
4. FK baseline reviewed and supplied to `--apply` invocation

These gates are NOT unblocked by the candidate merge — they require operator action with protected production copies.
