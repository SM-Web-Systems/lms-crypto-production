# AUTH-14 Release Preparation — Iterative Review TODO

> Created: 2026-11-02  
> Updated: 2026-11-02  
> Candidate commit (code): `d5191b9a778ea489eb9200936bd0e8fa0e7876dd`  
> Branch tip (prompt docs): `b9e4363855e1b1c12a8e8ca24820be8a83c912ce`  
> Target base: `e2c71e292c2be2683a4ee87008817ed34cc16023` (main HEAD, W09-R7)

---

## Tool / Skill Availability

| Tool | Status | Path / Notes |
|------|--------|------|
| Superpowers (brainstorming, writing-plans, executing-plans, subagent-driven-development, TDD, systematic-debugging, verification-before-completion, requesting-code-review, receiving-code-review, using-git-worktrees) | ✅ installed | `/home/webadmin/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/` |
| Ripwire | ✅ installed | `/home/webadmin/.local/bin/ripwire` — ranked symbol map, codebase analysis |
| Ponytail | ❌ not found | Not in PATH, plugins, or marketplace. Searched: `/home/webadmin/.local/bin/`, all skill dirs, `obra-superpowers-marketplace` (empty). Independent work proceeds. |
| Caveman | ❌ not found | Same search scope as Ponytail. Not installed. |
| find-skills | ❌ not a skill | Not in superpowers 6.3.0 skill list. |

---

## Phase 0 — Assessment (complete)

- [x] **A1** Fetch prompt from `b9e4363:docs/release/AUTH-14-SUPERPOWERS-ITERATIVE-REVIEW-PROMPT.md` — _done_
- [x] **A2** Fetch prior dep-reconciliation prompt and evidence from `1af91e7` — _done_
- [x] **A3** Identify code candidate (`d5191b9`) vs. branch tip (`b9e4363`; docs only) — _done_
- [x] **A4** Confirm worktree at `d5191b9`, updated to `b9e4363` (docs/prompt commits only, no code change) — _done_
- [x] **A5** Read `migrateRewardTxnCheck.ts`, `release_recovery.py`, migration tests, recovery tests, FK baseline doc — _done_
- [x] **A6** Run Ripwire on `LMS-Server/src` and `scripts/` — _done_
- [x] **A7** Verify clean-install test results (2288/2288 TypeScript, 50/50 Python) — _done (2026-11-02)_
- [x] **A8** Confirm proxy-addr 2.0.8 in lockfile and installed image — _done_
- [x] **A9** Confirm running container image IDs for policy correctness — _done_
- [x] **A10** Check CI: zero runs on `d5191b9`, `1af91e7`, `b9e4363`; no PR exists — _done_
- [x] **A11** Confirm no PR for `codex/auth14-release-prep` — _done_

---

## Phase 1 — Artifacts (in-scope, this session)

- [x] **T1** Create `docs/superpowers/todos/2026-11-02-auth14-release-prep-todo.md` — _this file_
- [x] **T2** Create `docs/superpowers/specs/2026-11-02-auth14-release-prep-spec.md` — _in progress_
- [x] **T3** Create `docs/superpowers/diagrams/2026-11-02-auth14-release-dep-flow.md` (release dependency flow) — _in progress_
- [x] **T4** Create `docs/superpowers/diagrams/2026-11-02-auth14-fk-migration-sequence.md` (FK baseline + migration transaction) — _in progress_
- [x] **T5** Create `docs/superpowers/diagrams/2026-11-02-auth14-deployment-recovery-flow.md` (deployment/recovery decision) — _in progress_

---

## Phase 2 — Code Quality (evidenced defects)

### LOW-1: `requireFkBaseline` combined error message (in-scope, fixable)

**Finding:** Lines 323–328 of `migrateRewardTxnCheck.ts` combine format/range validation (`!isSafeInteger`, `< 0`, bad hash regex) with state-mismatch checks in one condition, throwing a single ambiguous error for both cases. The CLI guard catches malformed arguments before reaching this code path, so production CLI use is not affected. Programmatic callers receive a misleading error message.

**Decision:** Fix with TDD — split into two separate error paths with distinct messages. Low-risk; improves operator diagnostics and API usability. No behavior change for well-formed arguments.

- [x] **T6** Write failing test for format/range error distinction — _done_
- [x] **T7** Implement fix (split condition) — _done_
- [x] **T8** Verify tests still pass — _done (2289/2289, +1 new test; 50/50 Python)_

### LOW-2: `pythonJson` lone surrogate scope (deferred)

**Finding:** `replace(/[\u007f-\uffff]/g, ...)` handles BMP code points up to U+FFFF but produces incorrect escape sequences for lone surrogates (U+D800–U+DFFF). SQLite table names from PRAGMA are constrained to valid SQLite identifiers; lone surrogates are pathological. No current production risk.

**Decision:** Deferred — not a realistic attack vector given SQLite's identifier constraints. Track separately.
- [ ] **T9** _(deferred)_ Track as separate ticket: `pythonJson` lone-surrogate scope for future robustness.

---

## Phase 3 — Merge Preparation

- [x] **T10** Full diff review against `e2c71e2` — verify no unrelated/private files — _done_
- [x] **T11** Create draft PR `codex/auth14-release-prep` → `main` — _done: SM-Web-Systems/lms-crypto-production#144_
- [ ] **T12** Monitor CI on PR head SHA `08f7e0f` — _pending: 3 jobs running_
- [ ] **T13** Confirm `dependency-security.test.ts` passes in CI (2289/2289 expected) — _pending_

---

## Production Gates (operator/external — not this session)

| Gate | Status | Notes |
|------|--------|-------|
| CI pipeline run | **RUNNING** | PR #144; 3 jobs pending; pass expected (local 2289/2289) |
| Independent review reference | **OPEN** | Required for `verify_policy`; operator supplies |
| FK violation resolved in production | **OPEN** | 1 violation (`students[rowid=8]`); operator chooses A/B/C from maintenance procedure |
| Final FK baseline from quiesced prod DB | **OPEN** | Must capture from stopped production DB at deployment time |
| Pre-migration backup/restore drill | **OPEN** | Drill on quiescence-time backup |
| Writer admission procedure approved | **OPEN** | Reward scheduler, callbacks, email retry, deletion service must all quiesce |
| Production web image with Clerk key | **OPEN** | `VITE_CLERK_PUBLISHABLE_KEY` injected at CI build time |
| Rollback/forward recovery rehearsal on exact image | **OPEN** | Distinct from AUTH-13-plus-dist rehearsal image |
| Policy review | **OPEN** | `recovery-policy-draft-e2c71e2.json` UNRESOLVED fields filled at deployment time |
| Monitoring transition | **OPEN** | Confirm health monitors switch to new image revision |

---

## Evidence Index

| Artifact | Location | Notes |
|----------|----------|-------|
| Assessment findings | `docs/release/AUTH-14-assessment-findings.md` | Committed to branch; updated 2026-11-02 with clean-install evidence |
| Recovery policy draft | `lms-rehearsal-2026-11-01/recovery-policy-draft-e2c71e2.json` | Partially filled; UNRESOLVED fields need deployment-time values |
| Clean-install dir | `/home/webadmin/auth14-clean-ci/LMS-Server` | npm ci from d5191b9 lockfile; proxy-addr 2.0.8 |
| Clean candidate API image | `lms-api:auth14-candidate-d5191b9` (local) | `sha256:f9e76c2e...`; OCI rev `d5191b9...` |
| Clean candidate web image | `lms-web:auth14-candidate-d5191b9` (local) | `sha256:a216a4b5...`; no Clerk key |
| Rehearsal snapshot | `/home/webadmin/auth14-rehearsal/snapshot/student_ms_snapshot.db` | Immutable; WAL-consistent backup of live DB |
| Maintenance procedure | `lms-rehearsal-2026-11-01/maintenance-procedure-e2c71e2.md` | FK Options A/B/C documented |
