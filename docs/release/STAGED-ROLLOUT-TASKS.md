# Staged rollout — task ledger

Date: 2026-10-29
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
- **Advisories carried forward**: A1 (Paystack amount/currency cross-check — future scope), A2 (DUPLICATE_REFERENCE error leaks reward ID), A3 (no DB-level UNIQUE on funding_reference), A4 (platform_credit balance check spec gap — **now addressed by R1: platform_credit fails closed**), A5 (FundingSource interface duplication)

### S2-T01-R1: Implement W01-R1 — internal funding authorization and credit backing
- **Status**: MERGED
- **Dependencies**: S2-T01 merged ✓, handover document review ✓
- **Owner**: S2 session (AI-delegated)
- **Spec**: `docs/superpowers/specs/2026-10-27-W01-R1-internal-funding-authorization.md`
- **Branch**: `codex/w01r1-internal-funding-authorization` at `550bd9a`
- **PR**: #105 — MERGED at `8096b9b` (2026-10-28)
- **Problem**: S2-T01 (PR #104) added funding verification for external sources but left internal sources (`admin_grant`, `platform_credit`) passing through without `reward.manage` permission checks or conflict-of-interest enforcement. Identified in handover document `SERVER-HANDOVER-W01-REVIEW-AND-REPAIR.md` at commit `223b262`.
- **Implementation (initial at `385e512`, corrected at `550bd9a`)**:
  - `rewardFundingVerifier.ts`: Added `FundingAuthorizationContext` interface and exported `verifyInternalAuthorization()` gate. Internal sources require `reward.manage` + actor ≠ creator. `platform_credit` fails closed (INSUFFICIENT_CREDIT 402). `admin_grant` proceeds after authorization.
  - `rewardService.ts`: `fundReward()`, `fundRewardAsync()`, `fundRewardVerified()` pass authorization context. Added `isInternalSource()` helper. **R1-F1 (grant ownership)**: `funderId = creator` for internal sources; funder account, fund/reserve ledger entries, and cancel/release/refund/expire paths all use creator as financial beneficiary. Admin recorded as `actorUserId` for audit only. **R1-F2 (transaction-time recheck)**: `verifyInternalAuthorization()` called inside both transaction bodies before financial mutation — defense-in-depth against TOCTOU.
  - 13 existing test files updated to use independent admin funding pattern.
- **Correction**: PR #105 review (handover `SERVER-HANDOVER-W01-R1-PR105-REVIEW.md`) identified two defects in initial `385e512`: F1 (admin incorrectly became funder instead of creator) and F2 (no transaction-time recheck). Both fixed at `550bd9a`, merged at `8096b9b`.
- **Tests**: 23 R1 tests (11 original + 8 F1 + 4 F2) + 1854 total (181 files); RED on `385e512`, GREEN on `8096b9b`
- **Closure C1**: PR #106 (`codex/w01r1-interleaving-regressions` at `51928fd`) — 2 genuine async interleaving regression tests proving transaction-time recheck catches mid-flight permission revocation and creator-change TOCTOU
- **Independent security review**: APPROVED — 10/10 checklist items passed; correction review APPROVED
- **CI**: All checks PASS (runs `40572428530` for #105, `40644680249` for #106)
- **R1 invariants enforced**:
  1. `reward.manage` required for `admin_grant` and `platform_credit`
  2. Conflict of interest: actorId ≠ rewardCreatorId
  3. `platform_credit` unconditionally fails closed (no credit provisioning)
  4. External sources (`stellar`, `paystack`) unaffected
  5. Transaction atomicity: no partial ledger entries on authorization failure
  6. Grant ownership: internal-source funder = reward creator (not authorizing admin)
  7. Transaction-time recheck: `verifyInternalAuthorization()` inside write transaction
  8. Interleaving regression: TOCTOU between verifier and transaction proven and covered

### S2-T01-R2: Implement W01-R2 — Paystack payment binding
- **Status**: MERGED
- **Dependencies**: S2-T01-R1 merged ✓, C1 merged (#106 at `fa187b8`) ✓
- **Owner**: R2 session (AI-delegated)
- **Spec**: `docs/superpowers/specs/2026-10-28-W01-R2-paystack-payment-binding.md`
- **Plan**: `docs/superpowers/plans/2026-10-28-W01-R2-tdd-plan.md`
- **Branch**: `codex/w01r2-paystack-payment-binding` at `0dce716`
- **PR**: #107 — MERGED at `17d93f0` (2026-10-28)
- **Implementation**:
  - `rewardFundingVerifier.ts`: `PaystackBindingContext` interface, exported `verifyPaystackBinding()` with ordered checks: status → currency settlement → amount match → ownership (customer email). `hasCurrencySettlementPath()` returns true only for direct currency match.
  - `rewardService.ts`: `fundRewardAsync()` builds `PaystackBindingContext` from reward's authoritative DB row (amount_stroops × max_recipients, currency_code) and actor's email via `lookupUserEmail()`. Passes context to async verifier.
  - `paystackService.ts`: Extend `PaystackVerifyResponse` with optional `customer.email`.
  - `rewardErrors.ts`: Add `FUNDING_CURRENCY_MISMATCH` (402), `FUNDING_AMOUNT_MISMATCH` (402), `FUNDING_OWNERSHIP_MISMATCH` (403).
- **Currency settlement gap**: Rewards are XLM (stroops); Paystack is fiat (USD/ZAR). No settlement policy exists. Paystack funding of XLM rewards fails closed with `FUNDING_CURRENCY_MISMATCH` (402). **Operational Paystack reward funding is unavailable.** Enablement requires: returned-reference matching, trusted payment/reward-obligation binding, minor-unit conversion/quote policy, ownership verification, and post-await obligation revalidation — each as a separate, independently reviewed capability gate.
- **Tests**: 12 new R2 tests (currency mismatch, amount mismatch, ownership mismatch, status binding, denial atomicity, direct verifier unit tests). 4 existing tests updated (acceptance → expects currency mismatch; cross-reference/idempotency tests migrated to admin_grant). 182 files, 1866 passed / 1 skipped / 1867 total, 0 regressions. All 25 R1 tests preserved.
- **Independent review**: Spec review: APPROVED_WITH_NOTES (6 findings, F1 HIGH resolved: error codes added to typed object; F2 MEDIUM resolved: direct verifier unit tests added; F3 MEDIUM resolved: all 4 Paystack mock sites updated). Code review: APPROVED_WITH_NOTES at `1ecff73` (dead import fixed at `0dce716`).
- **CI**: PR run `40705200669` (SUCCESS, 3 jobs); cleanup run `40705436715` (SUCCESS); main post-merge run `40706452331` (SUCCESS).
- **Acceptance criteria results**:
  1. ✅ Amount mismatch: `verifyPaystackBinding` rejects (T11, direct unit test)
  2. ✅ Currency mismatch: `fundRewardAsync` rejects XLM+fiat (T01, T02, T07)
  3. ✅ Ownership mismatch: `verifyPaystackBinding` rejects (T12, direct unit test)
  4. ✅ Obligation: documented gap (no Paystack init for rewards); fail-closed via currency gate
  5. ✅ Status binding: failed/pending/abandoned rejected (T04, T05, T06)
  6. ✅ XLM + fiat = fail closed (T01, T07)
  7. ✅ Full match: `verifyPaystackBinding` passes (T13, direct unit test with USD context)
  8. ✅ Denial atomicity: reward state, ledger, accounts unchanged (T07, T08)
  9. ✅ 25 R1 tests pass; 182 files, 1866 passed / 1 skipped / 1867 total, 0 regressions
  10. ✅ R3 atomic-consumption gate explicitly pending (documented in spec and ledger)
- **Does NOT include**: Atomic concurrent-reference consumption (R3), Stellar Horizon client (deferred), W02–W04

### S2-T01-R3: Implement W01-R3 — atomic payment-reference consumption
- **Status**: MERGED (corrected)
- **Dependencies**: S2-T01-R2 merged ✓ (PR #107 at `17d93f0`)
- **Owner**: R3 session + R3C correction session (AI-delegated)
- **Spec**: `docs/superpowers/specs/2026-10-28-W01-R3-atomic-reference-consumption.md` (original); `docs/superpowers/specs/2026-10-28-W01-R3C-correction-spec.md` (correction)
- **Plan**: `docs/superpowers/plans/2026-10-28-W01-R3-tdd-plan.md` (original); `docs/superpowers/plans/2026-10-28-W01-R3C-tdd-plan.md` (correction)
- **Branch (original)**: `codex/w01r3-atomic-reference-consumption` at `b852d5c`
- **PR (original)**: #108 — MERGED at `7a23f88` (2026-10-28)
- **Correction handover**: `docs/release/SERVER-HANDOVER-W01-R3-PR108-REVIEW.md` at `0d304dd` on `codex/platform-wiring-audit`
- **Branch (correction)**: `codex/w01r3c-correction` at `0144357`
- **PR (correction)**: #109 — MERGED at `a929836` (2026-10-28)
- **Three-layer defense**: (1) Outer pre-check optimization, (2) in-transaction `checkReferenceInTransaction()`, (3) partial UNIQUE index as authoritative DB-level enforcement
- **R3C corrections applied**:
  - **F1 FIXED**: `legacyUniqueExemptions` in `databaseBootstrap.ts` tolerates missing R3 UNIQUE pre-migration; `idx_reward_txn_fund_ref_unique` added to `required-schema.json` for post-migration enforcement. Pre-R3 databases now upgrade successfully.
  - **F2 FIXED**: `normalizeReference()` preserves exact nonblank values (opaque identity). Empty → null; all other values stored exactly as received. Consistent with historical writer and raw UNIQUE index.
  - **F3 FIXED**: T02/T06 use valid reward IDs with specific `isFundingReferenceConstraintViolation` assertion. T04 proves genuine rollback frees reference. T08 whitespace stored exactly. T11 real pre-R3 upgrade. T12 real duplicate rejection. T14 opaque identity. T15 F1 exemption. T16 required-schema.json.
- **Tests**: 25 R3 tests (was 21 at R3C, was 15 at R3); 183 files, 1892 passed, 0 failures, 0 regressions. All 25 R1 + 12 R2 tests preserved.
- **Independent review**: R3C spec review: APPROVED_WITH_NOTES (notes incorporated). R3C code review: APPROVED (6/6 checklist PASS). R3D spec review: APPROVED_WITH_NOTES. R3D code review: APPROVED (7/7 checklist PASS).
- **CI**: PR #109 run `40728271331` (SUCCESS, 4 jobs); main post-merge run `40729467144` (SUCCESS, 4 jobs). PR #110 run `40736862787` (SUCCESS, 4 jobs); main post-merge run `40738034939` (pending).
- **R3D correction (PR #110)**: `legacyUniqueExemptions` restricted to pre-migration only (`afterMigrations=false`). `required-schema.json` `keys.reward_transactions.unique` includes partial UNIQUE signature. T17 (non-UNIQUE same-name rejects), T18 (wrong-definition rejects), T19 (concurrent `fundRewardAsync` competing calls), T20 (injected post-fund rollback). Merged at `1a5326ac` (2026-10-28).
- **Advisories resolved**: A2 (DUPLICATE_REFERENCE no longer leaks reward ID), A3 (DB-level UNIQUE on funding_reference)
- **Advisories remaining**: A1 (Paystack amount/currency — gated by R2 currency mismatch), A5 (FundingSource duplication — cosmetic)
- **Does NOT include**: Stellar Horizon client (deferred separately)

### Deferred: Stellar Horizon integration
- **Status**: DEFERRED
- **Scope**: Stellar transaction verification when a Horizon client is configured. Currently fails closed (FUNDING_UNVERIFIED 402). Separate from W01 repair units — Stellar denied-by-default is correct security posture until a Horizon client integration is implemented and tested.
- **Not a W01 repair unit**: Stellar's fail-closed behavior is the intended R1 result, not a gap requiring repair.

### S2-T02: Implement W02 — cross-owner reward scope checks
- **Status**: PARTIALLY_FIXED — W02-R1 merged; W02-R2 pending
- **Dependencies**: S1-T03 spec reviewed ✓
- **Owner**: W02 session + W02-R1 session

#### W02 PR #111 (route/scope checks) — MERGED `211c556c` (2026-10-28)
- Route layer: scope validation on GET /:id, GET /:id/allocations, GET /:id/transactions in teacher.ts, parent.ts, employer.ts (matching sponsor.ts pattern)
- Service layer: scope checks on lifecycle/idempotency fast-return paths (activateReward, approveReward, fundReward, cancelReward, releaseAllocation, refundAllocation, createReward)
- 404 contract: read-path scope denial returns 404 (not 403) — do not confirm existence
- 28 new tests (reward-cross-owner.test.ts); 5 updated in rbac-sponsor-isolation.test.ts
- CI: Backend+Frontend+Offline+E2E all PASS (run 40827839081); post-merge main PASS (40828311942)
- Independent AI review: APPROVED
- Review disposition: [SERVER-HANDOVER-W02-PR111-REVIEW.md](SERVER-HANDOVER-W02-PR111-REVIEW.md) — CHANGES_REQUIRED (F1/F2/F3 remaining)

#### W02-R1 PR #112 (replay binding) — MERGED `87a9f40b` (2026-10-29)
- F1 fix: `checkTransactionIdempotency` now returns `reward_id`, `allocation_id`, `transaction_type`
- Binding checks in all 7 fast-return paths: fund×3, cancel, release, refund, expire
- Cross-resource/cross-action key reuse → IDEMPOTENCY_CONFLICT 409
- createReward idempotency binds on scope_type + scope_id
- New error code: IDEMPOTENCY_CONFLICT
- 18 new tests (reward-idempotency-binding.test.ts); 1937 total passed
- CI: all 4 jobs PASS (run 40844990098); post-merge main PASS (40845800635)
- Independent AI review: APPROVED (P2-1 null guard, P2-2 token role — both applied)

#### W02-R1C PR #113 (intent binding + access-before-replay) — MERGED `88db657a` (2026-10-29)
- C1: `createReward` keys now bind to `amount_stroops + reward_type + currency_code`; same-scope replay with different amount/type raises 409
- C1: `fundReward` (sync/async/verified) keys now bind to `funding_source_type` and normalized `funding_reference`; different source or reference raises 409
- C1: Opaque W01 reference identity preserved (`null === null` matches; no case normalization)
- C2: All fast-return paths (fund×3, cancel, release, refund, expire) resolve+authorize requested resource before checking binding; unauthorized/missing target returns established 404 regardless of key
- Fix 3 genuine-retry tests that previously generated new references on replay (R1-F1-1c, R1-HTTP-1, W02-G-7)
- `checkTransactionIdempotency` upgraded to return `funding_source_type` and `funding_reference`
- 16 new tests (idempotency-binding C1/C2 groups); 1953/1954 total passed (1 pre-existing skip)
- CI: all 4 jobs PASS (run 40860417566, Backend 5m7s); post-merge main run 40861303452 in progress
- Independent AI review: APPROVED (no P1 findings)
- Review source: SERVER-HANDOVER-W02-R1-PR112-REVIEW.md at `d610f32` on `codex/platform-wiring-audit`

#### W02-R2 — PENDING (separate run)
- F2: nested action URLs ignore reward parent (sponsor/teacher/parent/employer release/refund routes)
- F3: route/list tests use raw getters not HTTP; list test has MODULE_NOT_FOUND (require path bug); role fixtures have incidental roles
- Scope: nested binding + real authenticated HTTP tests for teacher/parent/employer + list/role-only fixture fixes

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
