# Staged rollout — task ledger

Date: 2026-10-27
Index: [STAGED-ROLLOUT-INDEX.md](STAGED-ROLLOUT-INDEX.md)

Status key: `TODO` `IN_PROGRESS` `BLOCKED` `IN_REVIEW` `DONE` | Post-merge: `MERGED` `DEPLOYED` `ACCEPTED`

---

## S1 — Inventory, specification and independent dependency work

### S1-T01: Complete branch-to-PR reconciliation table
- **Status**: DONE
- **Owner**: Plan session
- **Evidence**: [STAGED-ROLLOUT-INDEX.md](STAGED-ROLLOUT-INDEX.md) discovery limits and baselines
- **Completion**: All accessible branches inventoried; 9 Wallet phase-5 branches flagged as owner-evidence-required

### S1-T02: Reassess W01–W12 against current source
- **Status**: DONE
- **Owner**: Plan session
- **Evidence**: [STAGED-ROLLOUT-EVIDENCE.md](STAGED-ROLLOUT-EVIDENCE.md) finding ledger
- **Completion**: All 12 findings assessed against `main` HEAD code; confirmed W01–W04 vulnerable on main, W05–W09 present, W10–W12 integration/acceptance state documented

### S1-T03: Write developer specs for W01–W04 (reward security)
- **Status**: DONE
- **Dependencies**: None
- **Owner**: S1 session
- **Scope**: One spec per finding: W01 funding verification, W02 cross-owner scope, W03 allocation cap, W04 completion eligibility
- **Files**: `docs/superpowers/specs/2026-10-27-W01-funding-verification.md` through `W04`
- **TDD**: RED — characterization probe passes (defect confirmed); write intended-behavior test that fails. GREEN — implement fix. Refactor while green.
- **Review gate**: Independent spec review before implementation
- **Acceptance**: Characterization probes fail; new regressions pass; no existing test regressions
- **Completion**: Specs committed at `0fbf1bc`. Independent review: W01 APPROVED_WITH_NOTES (async/sync flag added), W02 APPROVED_WITH_NOTES (approveReward fast-return documented), W03 APPROVED, W04 APPROVED_WITH_NOTES (historical data audit note added). Review notes applied to specs.

### S1-T04: Write developer specs for W05–W09 (reward contracts/portal)
- **Status**: DONE
- **Dependencies**: None
- **Owner**: S1 session
- **Scope**: W05 type enum alignment, W06 family discriminator, W07 billing DTOs, W08 portal actions, W09 error states
- **Files**: `docs/superpowers/specs/2026-10-27-W05-W09-reward-contracts.md` (combined)
- **Review gate**: Independent spec review before implementation
- **Completion**: Combined spec committed at `0fbf1bc`. Independent review: APPROVED_WITH_NOTES. W06 flagged for re-investigation — `resolveParentScopeType()` may already be partially implemented. W07 needs discovery step during S3. Notes applied to spec.

### S1-T05: Evaluate and merge safe Dependabot PRs
- **Status**: DONE
- **Dependencies**: None
- **Owner**: S1 session
- **Scope**: Review PRs #45 (cors), #50 (express-rate-limit), #53 (tailwind-merge), #70 (@types/node), #86 (playwright). Check changelogs, breaking changes, CI status.
- **Decision needed (D11)**: Major version PRs (#43 vitest 5, #46 TS 7, #48/#49 dompurify 4, #51 react-hooks 7) require developer review — do NOT bulk-merge.
- **Acceptance**: Each PR CI-green after merge; no regression in existing test suites
- **Completion**: PR #86 **MERGED** to main at `c9e9c094` (AI-approved, independent review APPROVED). PRs #45, #50, #53 need `@dependabot rebase` (CI FAILURE, mergeable UNKNOWN). PR #70 needs investigation (major version). Major version PRs deferred to D11.

### S1-T06: Merge PR #90 (build-tool advisories)
- **Status**: MERGED
- **Dependencies**: None
- **Owner**: S1 session
- **Scope**: `codex/build-tool-advisories` → main. CI passing, 1 commit ahead.
- **Acceptance**: CI green on resulting main HEAD
- **Completion**: **MERGED** to main at `5668fd8d` (AI-approved, independent review APPROVED). HEAD was `e35a3fb8`, all 4 CI checks SUCCESS, merge state CLEAN. Main advanced from `c9e9c094` (post-#86) to `5668fd8d`.

### S1-T07: Create Mermaid diagrams
- **Status**: DONE
- **Owner**: Plan session
- **Evidence**: Diagrams in [STAGED-ROLLOUT-INDEX.md](STAGED-ROLLOUT-INDEX.md) and [STAGED-ROLLOUT-EVIDENCE.md](STAGED-ROLLOUT-EVIDENCE.md)
- **Rendering**: Source only; rendering verified where tooling available

### S1-T08: Independent review of S1 deliverables
- **Status**: DONE
- **Owner**: S1 session
- **Scope**: Independent review of W01-W04 specs, W05-W09 spec, PR #86/#90 merge candidates
- **Completion**: All specs APPROVED (with notes where applicable). PR #86 and #90 confirmed SAFE. Review notes applied to spec files. Evidence recorded in STAGED-ROLLOUT-EVIDENCE.md.

### S1-T09: Dispose LMS branches without PRs (D7)
- **Status**: DONE (AI retention decision)
- **Owner**: S1 session
- **Scope**: `test/auth-04-cross-module-tests` (3 commits, AUTH-04/05 review docs), `test/auth-04-sponsor-security-integration` (4 commits, AUTH-04 review). Content appears superseded by merged PRs #73/#74.
- **Decision (D7)**: **RETAIN** — branches are retained without deletion in S1. Content is superseded but serves as audit trail. No branch deletion authorized in this work unit. Future disposition deferred to owner convenience.

---

## S2 — Reward security remediation (W01–W04)

**Git base**: Branch from `main` after S1 merges (PR #90, safe Dependabot, #93). Each fix gets its own branch and PR.
**Test commands**: From `LMS-Server`: `npm run build && npx vitest run` (full), or `npx vitest run src/__tests__/reward-*.test.ts` (focused).
**Rollback**: Each W01–W04 fix is a separate PR. If a fix introduces regressions, revert that PR's merge commit on main. The original vulnerability remains until a corrected fix merges. Document the known-vulnerable state if a revert is necessary.

### S2-T01: Implement W01 — funding verification gate
- **Status**: MERGED
- **Dependencies**: S1-T03 spec reviewed ✓
- **Owner**: S2 session (AI-delegated)
- **Files**: `LMS-Server/src/services/rewards/rewardFundingVerifier.ts` (NEW), `rewardService.ts` (modified), `rewardErrors.ts` (modified), route files `sponsor.ts`/`employer.ts`/`teacher.ts`/`parent.ts` (modified)
- **Branch**: `codex/w01-funding-verification` at `3088cb1e`
- **PR**: #104 — MERGED at `115d8c4f836a059aff733bb4cdeaabc9750963f2` (2026-10-27)
- **Implementation**:
  - NEW `rewardFundingVerifier.ts`: sync/async verification dispatch with exhaustive switch + `never` type
  - Stellar: denied (no Horizon client), throws FUNDING_UNVERIFIED (402)
  - Paystack: async-only via `verifyTransaction()`, sync path rejects with FUNDING_UNVERIFIED (402)
  - platform_credit/admin_grant: pass-through (pre-existing behavior preserved)
  - Cross-reward reference reuse blocked via `checkReferenceNotReused()`, throws DUPLICATE_REFERENCE (409)
  - Sync `fundReward()` preserved for backward compatibility; async `fundRewardAsync()` added for route handlers
  - Route handlers switched to async `fundRewardAsync()`
- **Tests**: 14 new W01 tests PASS; 233 existing reward tests PASS; 1827/1828 full backend PASS (1 pre-existing failure)
- **AI review**: APPROVED with 5 advisories (A1-A5, none blocking)
- **CI**: All 4 checks PASS (run `40476416544`)
- **Advisories carried forward**: A1 (Paystack amount/currency cross-check — future scope), A2 (DUPLICATE_REFERENCE error leaks reward ID), A3 (no DB-level UNIQUE on funding_reference), A4 (platform_credit balance check spec gap, pre-existing), A5 (FundingSource interface duplication)

### S2-T02: Implement W02 — cross-owner reward scope checks
- **Status**: TODO
- **Dependencies**: S1-T03 spec reviewed
- **Owner**: —
- **Files**: `LMS-Server/src/routes/sponsor.ts`, `teacher.ts`, `parent.ts`, `employer.ts`; `LMS-Server/src/services/rewards/rewardService.ts` (getReward, lines 541–542)
- **Problem**: `getReward()` returns any reward by ID without checking if the requesting actor owns it or has scope access. Routes for different prefixes (sponsor/teacher/parent/employer) can read each other's rewards. Lifecycle endpoints (activate, approve) have scope checks via `validateScope()` but read endpoints do not.
- **Intended behavior**: All reward read endpoints must verify the actor has scope access to the reward's `scope_type`/`scope_id`. Return 404 (not 403) for rewards outside the actor's scope.
- **TDD RED**: Write test for sponsor reading a parent's reward → currently returns 200.
- **TDD GREEN**: Add scope validation to reward read paths.
- **Review**: Independent security review required

### S2-T03: Implement W03 — allocation cap enforcement
- **Status**: TODO
- **Dependencies**: S1-T03 spec reviewed
- **Owner**: —
- **Files**: `LMS-Server/src/services/rewards/rewardService.ts` (activateReward, lines 168–207)
- **Problem**: `activateReward()` at line 198 creates an allocation for every audience member via `for (const memberId of members)`. If `members.length > max_recipients`, total allocations exceed the reserved fund. `deriveAggregateStatus()` uses `const total = maxRecipients ?? allocations.length` (line 93 in rewardStateMachine.ts) which masks the overallocation.
- **Intended behavior**: Before creating allocations, verify `members.length <= max_recipients` (when set). If audience exceeds cap, reject activation or truncate with explicit creator notification. Total allocated stroops must never exceed total reserved.
- **TDD RED**: Write test creating reward with `maxRecipients: 1` and audience of 3 → currently creates 3 allocations.
- **TDD GREEN**: Add cap check in `activateReward()` before allocation loop.

### S2-T04: Implement W04 — course completion eligibility scoping
- **Status**: TODO
- **Dependencies**: S1-T03 spec reviewed
- **Owner**: —
- **Files**: `LMS-Server/src/routes/lessonCompletions.ts` (line 157), `LMS-Server/src/services/rewards/rewardEligibilityService.ts` (evaluateEligibility, lines 137–198)
- **Problem**: Line 157 fires `produceOutboxEvent('course_completion', courseId, ...)` on every individual lesson completion, not on actual course completion. `evaluateEligibility()` matches `reward_type === 'course_completion' && event.event_type === 'course_completion'` (line 191) but does not verify the student actually completed the full course. Also does not verify the event's courseId matches the reward's scope.
- **Intended behavior**: Fire `course_completion` outbox event only when all required lessons in a course are completed (or use a separate completion check). Eligibility must verify the event's source course matches the reward's scope.
- **TDD RED**: Write test where single lesson completion triggers reward for `course_completion` type → currently triggers. Write test where unrelated course completion triggers reward → currently triggers.
- **TDD GREEN**: Fix outbox event production and eligibility evaluation.

---

## S3 — Reward contracts and portal completion (W05–W09)

**Git base**: Branch from `main` after S1 merges. Each fix gets its own branch and PR.
**Test commands**: Backend: `cd LMS-Server && npm run build && npx vitest run`. Frontend: `cd LMS-Frontend && npm ci && npx tsc --noEmit && npm test && npm run build`.
**Rollback**: Each W05–W09 fix is a separate PR. Revert the specific merge commit if regressions appear. W05–W09 are P2; a revert restores the current state which has DB-level guards (W05) or cosmetic/UX issues only.

### S3-T01: Implement W05 — reward type enum alignment
- **Status**: TODO
- **Dependencies**: S1-T04 spec reviewed
- **Owner**: —
- **Files**: `LMS-Server/src/config/database.ts` (line 1570–1572), `LMS-Frontend/src/` (reward creation forms)
- **Problem**: DB CHECK constraint allows `individual, milestone, course_completion, grade, custom`. UI may present additional type choices not in this set.
- **Acceptance**: All UI-presented types match DB enum; invalid types rejected at API level

### S3-T02: Implement W06 — family/child discriminator
- **Status**: TODO
- **Dependencies**: S1-T04 spec reviewed
- **Files**: `LMS-Server/src/routes/parent.ts` (reward creation around line 290)
- **Problem**: Parent reward creation uses `childId` as `scopeId` but the request body does not include a family discriminator to distinguish family-group vs individual-child targeting.

### S3-T03: Implement W07 — billing DTO alignment
- **Status**: TODO
- **Dependencies**: S1-T04 spec reviewed
- **Files**: `LMS-Server/src/routes/sponsor.ts` (billing routes)

### S3-T04: Implement W08 — portal action scoping
- **Status**: TODO
- **Dependencies**: S1-T04 spec reviewed
- **Files**: `LMS-Frontend/src/pages/TeacherDashboard.tsx`, `ParentDashboard.tsx`, `EmployerDashboard.tsx`, `SponsorDashboard.tsx`

### S3-T05: Implement W09 — truthful error/loading states
- **Status**: TODO
- **Dependencies**: S1-T04 spec reviewed
- **Files**: Frontend dashboard/list components

---

## S4 — Database integrity merge (PR #93)

**Test commands**: After merge: `cd LMS-Server && npm ci && npm run build && npx vitest run && npm run test:compiled-bootstrap`.
**Rollback**: Revert the merge commit on main. PR #93 preserves legacy completion evidence and rejects migration FK drift — reverting restores the previous (less strict) behavior, which is safe.

### S4-T01: Revalidate and merge PR #93
- **Status**: TODO
- **Dependencies**: S1 complete
- **Owner**: —
- **Scope**: `codex/database-integrity-followup` → main. 2 commits, CI green, mergeable.
- **Pre-merge**: Verify no conflict with any S1 merges (Dependabot, #90). Rerun CI on resulting merge if base changed.
- **Acceptance**: CI green on resulting main HEAD; existing migration fixtures preserved

---

## S5 — Mobile chain rebase and merge (#92→#94→#95→#97)

**Test commands**: After each merge: `cd LMS-Server && npm run build && npx vitest run`. After #97 merge (includes mobile): `cd LMS-Mobile && npm ci && npx tsc --noEmit && npm test -- --runInBand`. Android export: set CI/Expo env vars per Step 3 handover, then `npx expo export --platform android`.
**Rollback**: Revert the specific merge commit(s). Mobile chain adds acceptance guards and local dev tooling — reverting removes those additions without breaking existing functionality.

### S5-T01: Rebase PR #92 onto current main
- **Status**: TODO
- **Dependencies**: S4-T01 merged (clean main baseline)
- **Scope**: `codex/mobile-acceptance-followup` is 14 commits behind main. Rebase, resolve conflicts, rerun CI.

### S5-T02: Merge PR #92 → main
- **Status**: TODO
- **Dependencies**: S5-T01, CI green
- **Acceptance**: CI green on resulting main HEAD

### S5-T03: Retarget and merge PR #94 → main
- **Status**: TODO
- **Dependencies**: S5-T02
- **Scope**: Retarget `codex/mobile-dependency-security` from `codex/mobile-acceptance-followup` to `main`. Rerun CI.

### S5-T04: Retarget and merge PR #95 → main
- **Status**: TODO
- **Dependencies**: S5-T03

### S5-T05: Retarget and merge PR #97 → main
- **Status**: TODO
- **Dependencies**: S5-T04

---

## S6 — RBAC Step 1 acceptance (PR #98)

### S6-T01: Merge PR #98 to main
- **Status**: TODO
- **Dependencies**: S4-T01, S5-T05 (clean main with DB and mobile work)
- **Scope**: Retarget `codex/rbac-role-inventory` to main (currently targets main). Rerun CI against resulting merge.

### S6-T02: Production snapshot inventory (operator)
- **Status**: BLOCKED (D1, D2)
- **Dependencies**: S6-T01 merged; operator runs `rbac-inventory.mjs` on production snapshot
- **Scope**: Operator generates private inventory report, reviews account exceptions, returns aggregate summary

### S6-T03: Legacy endpoint usage evidence (operator)
- **Status**: BLOCKED (D3)
- **Dependencies**: Operator access-log review
- **Scope**: PATCH /api/v1/users/:id/role usage counts and observation period

---

## S7 — RBAC Step 2 merge and rehearsal (PR #99)

### S7-T01: Retarget and merge PR #99 → main
- **Status**: TODO
- **Dependencies**: S6 accepted (T02, T03 returned by operator)

### S7-T02: Protected-copy cutover rehearsal (operator)
- **Status**: BLOCKED (D2)
- **Dependencies**: S7-T01 merged; operator runs rbac-cutover.mjs plan/apply on protected copy
- **Scope**: Verify grant preservation, session invalidation, previous-image refusal

---

## S8 — RBAC Step 3 merge and compatibility window (PR #100)

### S8-T01: Retarget and merge PR #100 → main
- **Status**: TODO
- **Dependencies**: S7-T01 merged

### S8-T02: Compatibility testing with previous native binary
- **Status**: BLOCKED (D4)
- **Dependencies**: S8-T01 merged; operator identifies supported native builds

---

## S9 — Wallet chain merge and integration

### S9-T01: Merge Wallet PR #2 → main
- **Status**: TODO
- **Dependencies**: S5 (local services for testing), S7 (RBAC backend for identity contract)

### S9-T02: Retarget and merge Wallet PR #3 → main
- **Status**: TODO
- **Dependencies**: S9-T01

### S9-T03: Retarget and merge Wallet PR #4 → main
- **Status**: TODO
- **Dependencies**: S9-T02

### S9-T04: Cross-repo LMS+Wallet integration test
- **Status**: TODO
- **Dependencies**: S9-T03 merged; LMS S8-T01 merged
- **Scope**: Verify PKCE/SSO flow, verified-email onboarding, browser sign-in with both services running

---

## S10 — v1 release candidate

### S10-T01: Build combined candidate images
- **Status**: TODO
- **Dependencies**: S2–S3 fixes merged, S6–S9 merged, combined CI green

### S10-T02: Exact release manifest
- **Status**: TODO
- **Dependencies**: S10-T01
- **Scope**: Document exact SHAs, image digests, deployment commands, writer quiescence plan, backup procedure, recovery image

### S10-T03: Operator approval (D5)
- **Status**: BLOCKED
- **Dependencies**: S10-T02 presented to operator

### S10-T04: Execute approved deployment
- **Status**: TODO
- **Dependencies**: S10-T03 approved
- **Scope**: Quiesce writers → final snapshot → cutover → deploy → smoke tests → observe

---

## S11 — RBAC Step 4 schema contraction (PR #101)

### S11-T01: Retarget and merge PR #101 → main
- **Status**: TODO
- **Dependencies**: S10 deployed, compatibility window closed (D9), installed-client acceptance (D4)

### S11-T02: v2 contraction on protected copy (operator)
- **Status**: BLOCKED (D10)
- **Dependencies**: S11-T01 merged; operator approval of exact contraction

### S11-T03: v2 deployment (separate approval)
- **Status**: BLOCKED (D10)
- **Dependencies**: S11-T02 successful; recovery image proof

---

## S12 — Mobile device acceptance

### S12-T01: Build candidate native artifact
- **Status**: TODO
- **Dependencies**: S10 deployed (backend available for testing)

### S12-T02: Physical device testing
- **Status**: BLOCKED (hardware/device access)
- **Dependencies**: S12-T01

### S12-T03: Minimum supported build decision (D4)
- **Status**: BLOCKED
- **Dependencies**: S12-T02 evidence

---

## S13 — Audit documentation merge (PR #102)

### S13-T01: Update audit ledger with fix evidence
- **Status**: TODO
- **Dependencies**: S2, S3 fixes merged and tested

### S13-T02: Retarget and merge PR #102 → main
- **Status**: TODO
- **Dependencies**: S13-T01, all preceding documentation current
