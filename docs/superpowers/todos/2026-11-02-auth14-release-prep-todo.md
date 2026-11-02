# AUTH-14 Release Preparation — Iterative Review TODO

> Created: 2026-11-02  
> Updated: 2026-11-02 (merge remediation)  
> Code candidate: `d5191b9a778ea489eb9200936bd0e8fa0e7876dd`  
> Branch tip after remediation: `c2dafe169693` on `codex/auth14-release-prep`  
> Target base: `e2c71e292c2be2683a4ee87008817ed34cc16023` (main HEAD, W09-R7)  
> PR: SM-Web-Systems/lms-crypto-production#144

---

## Tool / Skill Availability

| Tool | Status | Path / Notes |
|------|--------|------|
| Superpowers (brainstorming, writing-plans, executing-plans, subagent-driven-development, TDD, systematic-debugging, verification-before-completion, requesting-code-review, receiving-code-review, using-git-worktrees) | ✅ installed | `/home/webadmin/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/` |
| Ripwire | ✅ installed | `/home/webadmin/.local/bin/ripwire` — ranked symbol map, codebase analysis |
| Ponytail | ❌ not found | Not in PATH, plugins, or marketplace. Independent work proceeds. |
| Caveman | ❌ not found | Same search scope as Ponytail. Not installed. |
| find-skills | ❌ not a skill | Not in superpowers 6.3.0 skill list. |

---

## Phase 0 — Assessment (complete)

- [x] **A1–A11** All assessment tasks complete (see prior version)

---

## Phase 1 — Artifacts (complete)

- [x] **T1** Create `docs/superpowers/todos/` ledger — _done_
- [x] **T2** Create `docs/superpowers/specs/2026-11-02-auth14-release-prep-spec.md` — _done (v1.1 after remediation)_
- [x] **T3** Create `docs/superpowers/diagrams/2026-11-02-auth14-release-dep-flow.md` — _done_
- [x] **T4** Create `docs/superpowers/diagrams/2026-11-02-auth14-fk-migration-sequence.md` — _done (updated for Findings 2/3)_
- [x] **T5** Create `docs/superpowers/diagrams/2026-11-02-auth14-deployment-recovery-flow.md` — _done_

---

## Phase 2 — Code Quality (all findings resolved)

### LOW-1: `requireFkBaseline` combined error message — **DONE**
- [x] **T6** Write failing test — _done_
- [x] **T7** Implement fix — _done_
- [x] **T8** Verify 2289/2289 — _done_

### Finding 2 (merge remediation): Receipt-trigger orphan mutation — **DONE**
**Finding:** An `AFTER INSERT` trigger on `system_config` could silently mutate orphan column values without changing the FK violation tuple. `requireFkBaseline` alone cannot detect this.  
**Fix:** Snapshot all FK-violating rows before receipt writes; compare after; rollback on mutation. Double-quote escaping added for table names with embedded `"` (code-review finding).

- [x] **M1** Write failing test (trigger mutates non-FK column) — _done_
- [x] **M2** Implement orphan snapshot + comparison — _done_
- [x] **M3** Fix code-review finding: escape `"` in table names — _done_
- [x] **M4** Additional tests: deleted-row case + double-quote table name — _done_
- [x] **M5** Verify 2301/2301 TypeScript, 50/50 Python — _done_

### Finding 3 (merge remediation): Idempotent bypass of FK baseline — **DONE**
**Finding:** `applyUpgrade` returned `alreadyAtTarget: true` for `target`/`absent` schemas without validating a supplied FK baseline.  
**Fix:** Call `requireFkBaseline` before the early return if a baseline is supplied.

- [x] **M6** Write failing tests (target/absent + malformed/mismatched baseline) — _done (8 tests)_
- [x] **M7** Implement fix (one-line guard) — _done_
- [x] **M8** Verify all tests pass — _done_

### Finding 1 (merge remediation): Privacy — assessment findings — **DONE**
**Finding:** `docs/release/AUTH-14-assessment-findings.md` contained production row identifiers (student UUIDs and name). PR body contained structural row reference.  
**Fix:** Redacted UUIDs and name; truncated full FK hash; updated PR body. Prior commits on branch retain originals — assessed under repo policy (private repo). Owner action may be required.

- [x] **M9** Audit all PR artifacts for private identifiers — _done_
- [x] **M10** Sanitize assessment findings — _done (commit 2450edc)_
- [x] **M11** Update PR body — _done_
- [x] **M12** Note exposure in spec §8 and PR body — _done_

### LOW-2: `pythonJson` lone surrogate scope (deferred)
- [ ] **T9** _(deferred)_ Track as separate ticket.

---

## Phase 3 — Merge Preparation

- [x] **T10** Full diff review against `e2c71e2` — no unrelated/private files — _done_
- [x] **T11** PR `codex/auth14-release-prep` → `main` — _done: #144_
- [x] **T12** CI on `bd2ea22` (initial PR head) — 4/4 PASS — _done_
- [x] **T13** Code review subagent — Claude Opus `aa6fba7587f097f08` — _done; 1 Important finding resolved_
- [ ] **T14** CI on final tip `c2dafe1` — _IN PROGRESS: 3/3 jobs running_
- [ ] **T15** Squash merge `codex/auth14-release-prep` → `main` — _pending CI pass_

---

## Production Gates (operator/external — not this session)

| Gate | Status | Notes |
|------|--------|-------|
| CI pipeline run | **RUNNING** | `c2dafe1`; run 41400344122; 3 jobs in-progress |
| Independent review reference | **OPEN** | Required for `verify_policy`; operator supplies |
| FK violation resolved in production | **OPEN** | 1 violation; operator chooses A/B/C from maintenance procedure |
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
| Assessment findings (sanitized) | `docs/release/AUTH-14-assessment-findings.md` | Committed; UUIDs/name redacted 2026-11-02 |
| Recovery policy draft | `lms-rehearsal-2026-11-01/recovery-policy-draft-e2c71e2.json` | UNRESOLVED fields; deployment-time values |
| Clean-install dir | `/home/webadmin/auth14-clean-ci/LMS-Server` | npm ci; proxy-addr 2.0.8; 2301/2301 tests pass |
| Clean candidate API image | `lms-api:auth14-candidate-d5191b9` (local) | `sha256:f9e76c2e...`; OCI rev `d5191b9...` |
| Clean candidate web image | `lms-web:auth14-candidate-d5191b9` (local) | `sha256:a216a4b5...`; no Clerk key |
| Rehearsal snapshot | `/home/webadmin/auth14-rehearsal/snapshot/student_ms_snapshot.db` | Immutable; WAL-consistent backup |
| Maintenance procedure | `lms-rehearsal-2026-11-01/maintenance-procedure-e2c71e2.md` | FK Options A/B/C documented |
| Code review | Claude Opus subagent `aa6fba7587f097f08` | Finding: double-quote escaping → resolved in `c2dafe1` |
