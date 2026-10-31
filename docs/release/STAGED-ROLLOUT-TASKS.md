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
- **Status**: FIXED — W02 repair chain complete (#111, #112, #113, #114, #115 all merged)
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
- CI: all 4 jobs PASS (run 40860417566, Backend 5m7s); post-merge main run 40861303452 SUCCESS (4/4)
- Independent AI review: APPROVED (no P1 findings)
- Review source: SERVER-HANDOVER-W02-R1-PR112-REVIEW.md at `d610f32` on `codex/platform-wiring-audit`

#### W02-R2 PR #114 (nested parent binding + real HTTP route tests) — MERGED `1229bd97` (2026-10-29)
- **Spec**: `LMS-Server/docs/specs/w02-r2-nested-parent-binding-spec.md`
- **Branch**: `codex/w02r2-nested-parent-binding` at `f49174e`
- **Merge commit**: `1229bd97d6399dd8807ae8936d4a47917a806f91`
- **F2 fix**: `releaseAllocation` and `refundAllocation` take new required 4th param `requestedRewardId: string`
  - Replay path: fail closed on missing parent; check `allocation.reward_id === requestedRewardId` → 404 before scope/admin check; then scope/admin check → 404; then binding check → 409
  - Fresh write path: check `allocation.reward_id === requestedRewardId` → 404 before existing scope check
  - 7 production callers updated: sponsor.ts (×2), teacher.ts (×1), parent.ts (×1), employer.ts (×2), rewardEligibilityService.ts (×1), adminRewards.ts (×1)
  - 8 existing test files updated (50+ call sites): reward-lifecycle, reward-orchestration, reward-refund-admin, reward-r13-routes, reward-idempotency-binding, reward-student-view, reward-internal-funding-auth, reward-cross-owner
- **F3 fix**: W02-R-1 through W02-R-8 in `reward-cross-owner.test.ts` replaced with real HTTP supertest requests to /api/v1/{sponsor,teacher,parent,employer}/rewards/:id; W02-L-1 list test fixed (was MODULE_NOT_FOUND via require(), now direct ESM import with try/catch)
- **37 new tests** in `reward-nested-parent.test.ts`: F2 service-level (mismatch, orphan, admin bypass in replay path), F2 HTTP regression guards, F3 authenticated route GET coverage (teacher/parent/employer ×3 each)
- **1990/1991 total passed** (1 pre-existing local proxy-addr skip, passes in CI)
- CI: all 4 jobs PASS (PR run 40869264008, Backend 5m21s); post-merge main run 40870444455 SUCCESS (4/4: Frontend 1m7s, Backend 4m59s, Offline 1m19s, E2E 1m29s)
- Independent AI review: APPROVED (no P1/P2 findings)
- Review disposition: CHANGES_REQUIRED per SERVER-HANDOVER-W02-R2-PR114-REVIEW.md — admin refund retry caller auth (P1 remaining)

#### W02-R2C PR #115 (admin refund retry caller auth) — MERGED `5cc386f` (2026-10-29)
- **Spec**: `docs/specs/W02-R2C-admin-refund-retry-caller-auth.md`
- **Branch**: `codex/w02-r2c` at `b1ef80e`
- **Merge commit**: `5cc386f594f87fd068a42fc3390523c3f7c925e1`
- **Defect**: Retry endpoint used `requirePermission('reward.refund')` (sponsor capability) and passed `attempt.attempted_by_user_id` to `refundAllocation`, allowing foreign allocation refunds
- **Fix 1**: `adminRewards.ts` — `requirePermission('reward.refund_review')` (admin-only); auth check fires before attempt lookup
- **Fix 2**: `adminRewards.ts` — pass `actorId` (authenticated caller) to `refundAllocation`; `attempted_by_user_id` preserved as historical record
- **Fix 3**: `rewardService.ts` — add `reward.manage` bypass to `refundAllocation` fresh write path, consistent with replay path
- **8 new tests** (reward-admin-refund-caller-auth.test.ts): RETRY-CALLER-1–4 RED (unrelated sponsor 403, no mutation, no disclosure); RETRY-CALLER-5–8 GREEN (admin 200/409, actor attribution, historical owner preserved)
- **1999 total tests** passed; TSC: clean
- CI: all 4 jobs PASS (PR run 40894071751); post-merge main run 40895057757 SUCCESS (4/4)
- Independent Opus review: APPROVED
- W02 FIXED — all four repair units (#111, #112, #113, #114, #115) merged

#### W02 Closure Follow-Up PR #116 — MERGED `e306cf9` (2026-10-30)
- **Branch**: `codex/w02-closure-follow-up`
- **Spec**: `docs/specs/W02-R2C-admin-refund-retry-caller-auth.md` (updated to COMPLETE)
- **F1 fix**: `adminRewards.ts` retry handler `handleRewardError` + try-catch — inconsistent `attempt.reward_id` now returns 404 (not 500); `reward.refund_review`-only scope denial returns 403 (not 500)
- **F2 policy**: `reward.refund_review` global visibility documented and tested; 409/404 consistent with list endpoint; mutation boundary at `reward.manage`/scope ownership
- **7 new tests** (reward-refund-retry-error-contract.test.ts): F1-ERROR-1/2, F2-REVIEW-1/2/3, F2-MANAGE-1, F2-LIST-1
- **2006 total tests** passed, 0 regressions, TSC clean
- CI: PR run 41004888708 — 4/4 PASS; post-merge main run 41005306755 — SUCCESS (4/4)
- Independent Opus review: APPROVED (all 7 points)
- **W02 fully closed** — main HEAD: `e306cf9`

### S2-T03: Implement W03 — allocation cap enforcement
- **Status**: MERGED — PR #117 squash-merged to main HEAD `655e11c` (2026-10-30)
- **Dependencies**: S1-T03 spec reviewed
- **Owner**: AI (Claude Sonnet 4.6)
- **Files modified**: `LMS-Server/src/services/rewards/rewardErrors.ts`, `rewardService.ts`, `rewardStateMachine.ts`
- **Test file**: `LMS-Server/src/__tests__/reward-allocation-cap.test.ts` (26 tests)
- **Defects fixed**:
  - **D1**: `activateReward()` now checks `members.length > (reward.max_recipients ?? 1)` before allocation loop; throws `AUDIENCE_EXCEEDS_CAP` (400) — fund and reservation preserved, user must correct audience or raise cap
  - **D2**: `createReward()` validates `max_recipients` at creation boundary: must be positive integer ≤ `MAX_RECIPIENTS` (10 000); throws `INVALID_RECIPIENT_COUNT` (400)
  - **D3**: `deriveAggregateStatus()` `maxRecipients` parameter removed; denominator is always `allocations.length` — below-cap activations (members < cap) no longer strand rewards in `partially_released`
- **Null-cap policy**: `max_recipients = null` → effective cap of 1 at activation, matching funding formula (`amount ?? 1`)
- **CI**: PR run 41011071843 — 4/4 PASS; post-merge main run 41011716903 — 4/4 SUCCESS
- **Independent review**: Opus APPROVED (confirmed D1/D2/D3 all addressed, null-cap consistent, atomicity sound)
- **Total tests**: 26 new, all pass; full suite regression-clean (pre-existing proxyaddr IPv6 failure on main unrelated)

### S2-T03-R1: Reconcile unused reservation on below-cap completion (W03-R1)
- **Status**: MERGED — PR #118 squash-merged to main HEAD `5b3c180` (2026-10-30)
- **Dependencies**: S2-T03 (W03 PR #117) merged
- **Owner**: AI (Claude Sonnet 4.6)
- **Problem**: After W03, `activateReward` creates `audience.length` allocations; funding reserved `amount * cap`. After full release, `(cap - audience) * amount` stroops permanently stranded in `funder.reserved` — no code path to return them.
- **Files modified**: `rewardTypes.ts`, `src/config/database.ts`, `database/schema.sql`, `rewardLedger.ts`, `rewardService.ts`
- **Test file**: `src/__tests__/reward-reservation-reconciliation.test.ts` (19 tests)
- **Implementation**: New `release_unused` transaction type (funder.reserved → funder.available). `reconcileUnusedReservation()` fires atomically in `updateRewardAggregateStatus` on `released` transition. Remaining reserved = `SUM(reserve) - SUM(release+cancel+expire+release_unused)` per reward_id. Idempotency key `release-unused-{rewardId}` with UNIQUE constraint. Cancel/expire unchanged.
- **CI**: PR run 41020058620 — 4/4 PASS; post-merge main run → `5b3c180`
- **Independent review**: Opus APPROVED (HIGH: schema migration documented in spec §9; MEDIUM: precondition comments applied pre-merge)
- **Total tests**: 19 new, all pass; 2051 full suite, 0 regressions, TSC clean; 26 W03 tests unmodified

### S2-T03-R2: Existing-ledger CHECK constraint upgrade for release_unused (W03-R2)
- **Status**: MERGED — PR #119 squash-merged to main HEAD `bc3e0df` (2026-10-30)
- **Dependencies**: S2-T03-R1 (W03-R1 PR #118) merged
- **Owner**: AI (Claude Sonnet 4.6)
- **Problem**: `CREATE TABLE IF NOT EXISTS reward_transactions` in W03-R1 is a no-op on existing databases. DBs initialized under #117 still carry old CHECK constraints lacking `'release_unused'`. `reconcileUnusedReservation()` fails with `SqliteError: CHECK constraint failed`.
- **Files modified**: `src/scripts/migrateRewardTxnCheck.ts` (new), `src/config/databaseBootstrap.ts`, `package.json`, `database/migrations/002-reward-transactions-check-upgrade.sql` (new)
- **Test file**: `src/__tests__/reward-txn-check-migration.test.ts` (35 tests covering all 12 spec requirements)
- **Implementation**: Offline migration script with `--plan`/`--apply` modes. Full table reconstruction in single transaction (rename→create→copy→drop→rename→4 indexes→system_config). `detectSchemaVersion()` fingerprint-based detection. `validateDatabase()` preflight refuses pre-W03-R2 schema with actionable diagnostic. Partial-swap detection per spec §3.4.
- **CI**: PR run 41037935927 — 4/4 PASS; post-merge main HEAD `bc3e0df`
- **Independent review**: Opus APPROVED — 8/8 criteria PASS; LOW partial-swap detection gap addressed pre-merge
- **Total tests**: 35 new, all pass; 2086 full suite, 0 regressions, TSC clean; 2051 prior suite unmodified

### S2-T03-R3: Migration validation corrections — F1 comment bypass, F2 object inventory, F3 transaction boundary (W03-R3)
- **Status**: MERGED — PR #120 squash-merged to main HEAD `fc59ec2` (2026-10-30)
- **Dependencies**: S2-T03-R2 (W03-R2 PR #119) merged
- **Owner**: AI (Claude Sonnet 4.6)
- **Problem**: Three post-merge defects in W03-R2. F1: `detectSchemaVersion` uses `sql.includes("'release_unused'")` — a SQL comment anywhere in pre-W03-R2 DDL bypasses schema detection; same bypass in `databaseBootstrap.validateDatabase`. F2: `applyUpgrade` hardcodes 4 `CREATE INDEX` statements; operator-added indexes/triggers silently dropped without warning. F3: `PRAGMA foreign_key_check` ran after `migrate()` commit — pre-existing FK violations cause operation to report failure but database already has target schema + receipt written (irreversible partial state).
- **Files modified**: `src/scripts/migrateRewardTxnCheck.ts` (normalizeDdl, SUPPORTED_INDEX_NAMES, inventoryDependencies, fixed detectSchemaVersion, planUpgrade, applyUpgrade), `src/config/databaseBootstrap.ts` (import detectSchemaVersion, replace F1-vulnerable substring check)
- **Test file**: `src/__tests__/reward-txn-check-migration.test.ts` (20 new W03-R3 tests appended to existing 35; 55 total migration tests; 2103 full suite)
- **Implementation**: `normalizeDdl()` strips `/* */` block and `--` line comments then collapses whitespace; `detectSchemaVersion()` requires both target multi-token patterns, or both source patterns + zero `'release_unused'` tokens in normalized DDL. `inventoryDependencies()` queries `sqlite_master` for non-autoindex indexes, triggers, and views; refuses with actionable diagnostic before any mutation. Pre-migration `foreign_key_check` + `integrity_check` + `inventoryDependencies` all execute before PRAGMAs. Post-reconstruction checks + receipt write moved inside `conn.transaction()` for atomic rollback on failure.
- **CI**: PR run 41047876413 — 4/4 PASS; post-merge main run 41048706028 — 4/4 PASS; post-merge main HEAD `fc59ec2`
- **Independent review**: Opus APPROVED — 3 LOW (normalizeDdl comment, legacy_alter_table OFF, error message wording), 1 MEDIUM (untested _new-only partial-swap) — all addressed pre-merge
- **Total tests**: 20 new, all pass; 2103 full suite (1 pre-existing skip), 0 regressions, TSC clean; 35 W03-R2 tests unmodified

### S2-T03-R4: Authoritative complete-schema validation — F1 permissive OR, F2 extra CHECK (W03-R4)
- **Status**: MERGED — PR #121 squash-merged to main HEAD `2f1c951` (2026-10-30)
- **Dependencies**: S2-T03-R3 (W03-R3 PR #120) merged at `fc59ec2`
- **Owner**: AI (Claude Sonnet 4.6)
- **Problem**: Two defects reproduced after W03-R3 merged. **F1**: `detectSchemaVersion` substring match accepted `CHECK (... OR 1=1)` appended to target DDL as `'target'` — constraint was permissive, migration no-oped leaving broken constraint. **F2**: Extra table-level `CHECK (amount_stroops < 1000)` in source DDL still matched source patterns; migration proceeded and silently dropped the extra CHECK.
- **Files modified**: `src/scripts/migrateRewardTxnCheck.ts` (canonicalizeDdl, extractTableBody, CANONICAL_SOURCE_BODY, CANONICAL_TARGET_BODY, SUPPORTED_INDEX_CANONICAL, REWARD_TXN_COLUMNS, detectSchemaVersion, inventoryDependencies, applyUpgrade)
- **Test file**: `src/__tests__/reward-txn-check-migration.test.ts` (26 new W03-R4 tests; 80 total migration tests; 2130/2131 full suite)
- **Implementation**: `canonicalizeDdl()` token-aware comment stripping with `pendingSpace`-before-`)` suppression; `extractTableBody()` body extraction between first/last parens. Exact `CANONICAL_SOURCE_BODY`/`CANONICAL_TARGET_BODY` comparison replaces substring patterns. `SUPPORTED_INDEX_CANONICAL` map verifies full index DDL, not just names. Explicit 23-column `INSERT INTO ... SELECT` list.
- **CI**: PR run 41071872186 — 4/4 PASS; post-merge main run 41073011635 — 4/4 PASS; post-merge main HEAD `2f1c951`
- **Independent review**: Sonnet APPROVED — 5 LOW, 0 CRITICAL/HIGH/MEDIUM
- **Total tests**: 26 new, all pass; 2130/2131 full suite (1 pre-existing), TSC clean

### S2-T03-R5: Full-statement validation — table options and literal semantics (W03-R5)
- **Status**: MERGED — PR #122 squash-merged to main HEAD `a58bf844` (2026-10-30)
- **Dependencies**: S2-T03-R4 (W03-R4 PR #121) merged at `2f1c951`
- **Owner**: AI (Claude Sonnet 4.6)
- **Problem**: Two defects reproduced after W03-R4 merged. **F1**: `extractTableBody` (used in `detectSchemaVersion`) discards everything after the last `)` — a STRICT table's ` STRICT` suffix is stripped before comparison, body matches canonical source, migration proceeds and silently removes STRICT enforcement. **F2**: `canonicalizeDdl` post-loop `IF NOT EXISTS` regex fires on the full result including preserved string literals — `DEFAULT 'IF NOT EXISTS XLM'` was rewritten to `DEFAULT 'XLM'`, producing a false body match against canonical source.
- **Files modified**: `src/scripts/migrateRewardTxnCheck.ts` (canonicalizeDdl pre-scan + post-loop regex removed; detectSchemaVersion suffix check + inline body extraction; extractTableBody docstring), `docs/superpowers/specs/2026-10-30-W03-R5-full-statement-validation.md`
- **Test file**: `src/__tests__/reward-txn-check-migration.test.ts` (18 new W03-R5 tests: COMPAT-F5-STRICT 8, COMPAT-F5-LITERAL 5, COMPAT-F5-IFLITERAL 5; 98 total migration tests; 2148 full suite)
- **Implementation**: F1: suffix check before body extraction in `detectSchemaVersion`; F2: pre-scan header mini-scanner strips IF NOT EXISTS before first `(` only.
- **CI**: PR run 41080960636 — 4/4 PASS; post-merge main run 41082051339 — 4/4 PASS
- **Independent review**: Opus APPROVED — CRITICAL none, HIGH none; 1 MEDIUM addressed (combined suffix test); LOW accepted
- **Total tests**: 18 new, all pass; 2148 full suite, 0 regressions, TSC clean

### S2-T04: Implement W04 — course completion eligibility scoping
- **Status**: COMPLETE
- **Dependencies**: S1-T03 spec reviewed
- **Owner**: Claude
- **PR**: #123 — `fix(W04): genuine course-completion gating and course-bound reward eligibility`
- **Merge commit**: `4285048` on main (2026-10-31)
- **Files changed**: `LMS-Server/src/routes/lessonCompletions.ts`, `LMS-Server/src/controllers/quizzesController.ts`, `LMS-Server/src/services/rewards/rewardEligibilityService.ts`, `LMS-Server/src/services/rewards/rewardService.ts`, `LMS-Server/src/services/courseCompletionService.ts`, `LMS-Frontend/package.json`, `LMS-Frontend/package-lock.json`, `LMS-Server/package-lock.json`
- **Implementation**:
  - `isCourseCompleteForReward()` — strict DB-backed predicate: all lessons + course-scoped quizzes + approved submission; fail-closed for empty/nonexistent courses
  - Producer guard in `lessonCompletions.ts` — `course_completion` outbox event only fires when `isCourseCompleteForReward()` returns true
  - Producer guard in `quizzesController.ts` — same gate on quiz pass; emits event when full course now complete
  - Consumer binding in `evaluateEligibility()` — independently derives `boundCourseId` from `sponsor_cohort.course_id` or `eligibilityConfig.requiredCourseId`; verifies event source matches; verifies DB proof
  - Activation-time binding: `activateReward()` validates and conflict-checks course binding before scope validation
  - Dedup reset: completed-but-ineligible outbox rows reset to pending (ineligible→eligible upgrade path); only `eligible` records block re-evaluation
  - `getCourseProgress` backward-compat: null-safe cross-course quiz guard for legacy unattached quizzes (NFT cert path only)
- **Tests**: 30/30 W04 tests pass; 2179/2179 full suite, 0 regressions, TSC clean
- **Independent review**: Opus APPROVED_WITH_NOTES (0 CRITICAL/HIGH; 2 MEDIUM pre-existing staff-mark and submission approval producer gaps not blocking; 4 LOW — LOW-1 addressed in `daedff6`)
- **Completion**: PR #123 merged `4285048`; post-merge CI run 41172329492 — 4/4 PASS

### S2-T04-R1: Implement W04-R1 — complete producer paths and reject conflicting bindings
- **Status**: COMPLETE
- **Dependencies**: S2-T04 (W04 PR #123) merged
- **Owner**: Claude
- **PR**: #124 — `fix(W04-R1): complete producer paths and reject conflicting course bindings`
- **Merge commit**: `aaf0bec` on main (2026-10-31)
- **Files changed**: `LMS-Server/src/routes/lessonCompletions.ts`, `LMS-Server/src/controllers/submissionsController.ts`, `LMS-Server/src/services/rewards/rewardEligibilityService.ts`, `LMS-Server/src/__tests__/reward-course-completion.test.ts`, `LMS-Server/docs/superpowers/specs/2026-10-31-W04-R1-producer-consumer-fixes.md`
- **Problem**: Three gaps identified by independent review of W04 (PR #123): F1 — staff-mark route (`lessonCompletions.ts`) never emitted `course_completion` outbox event; F2 — submission-approval path (`submissionsController.ts`) auto-completed course items but never checked or emitted `course_completion`; F3 — `evaluateEligibility()` sponsor_cohort consumer silently overwrote `boundCourseId` with `config.requiredCourseId` even when cohort's `course_id` had drifted post-activation to a different course.
- **Implementation**:
  - F1 — `lessonCompletions.ts` staff-mark route: wrapped in `db.transaction()`, calls `isCourseCompleteForReward(req.params.userId, courseId)` (learner identity), emits `course_completion` outbox event inside transaction, calls `processPendingEvents()` outside
  - F2 — `submissionsController.ts` `reviewSubmission()`: added `isCourseCompleteForReward(studentRecord.user_id, course_id)` + `produceOutboxEvent('course_completion')` inside existing `db.transaction()` after lesson auto-complete; preserves `grade_approved` semantics
  - F3 — `rewardEligibilityService.ts` `evaluateEligibility()` sponsor_cohort branch: conflict check before `requiredCourseId` overwrite — if `boundCourseId && config.requiredCourseId && they differ` → return `'ineligible'`; fail-closed on post-activation binding drift
- **Tests**: 48/48 W04-R1 tests pass in `reward-course-completion.test.ts`; 0 regressions; post-review additions: ARFL-1/2 (auto-release financial assertions), F2-H-6/7 (duplicate event prevention, multi-reward), F3-U-4/5 (teacher_class bypass, absent cohort fallback)
- **Independent review**: APPROVED_WITH_NOTES (2 Important findings addressed pre-merge: missing ARFL financial tests and missing spec-listed F2-H-6/7, F3-U-4/5 tests; minor: F1-H-5 transaction failure injection deferred pending harness change)
- **Completion**: PR #124 squash-merged `aaf0bec`; PR CI run 41185493672 — 4/4 PASS; post-merge CI run 41185913301 — 4/4 PASS

### S2-T04-R2: Implement W04-R2 — fail closed on deleted reward scope; F1-H-5 rollback proof
- **Status**: COMPLETE
- **Dependencies**: S2-T04-R1 (W04-R1 PR #124) merged
- **Owner**: Claude
- **PR**: #125 — `fix(W04-R2): fail closed on deleted reward scope; add rollback proof (F1-H-5)`
- **Merge commit**: `a946c0f` on main (2026-10-31)
- **Files changed**: `LMS-Server/src/services/rewards/rewardEligibilityService.ts`, `LMS-Server/src/__tests__/reward-course-completion.test.ts`, `LMS-Server/docs/superpowers/specs/2026-10-31-W04-R2-deleted-scope-fail-closed.md`, `docs/release/CLAUDE-SERVER-W04-R2-PROMPT.md`
- **Problem**: Two residuals from W04-R1. F-deleted — when `sponsor_cohort` row deleted post-activation, `evaluateEligibility()` fell through to `config.requiredCourseId` and returned `'eligible'`; `rewards.scope_id` has no FK to `sponsor_cohorts` so DB cannot enforce this. Same pattern for `teacher_class`/`employer_team`/`parent_family` (user_groups) and `parent_child` (user_links). F3-U-5 test previously expected `'eligible'` (permissive baseline — wrong). F1-H-5 was deferred in W04-R1 ("harness limitation") but W04-R2 confirmed it is feasible using a SQLite TEMP BEFORE INSERT trigger.
- **Implementation**:
  - `rewardEligibilityService.ts` `evaluateEligibility()` sponsor_cohort branch: `if (!cohort) return 'ineligible'` immediately after cohort lookup — before `config.requiredCourseId` assignment
  - Same pattern: user_groups existence check for teacher_class/employer_team/parent_family; user_links check for parent_child
  - `config.requiredCourseId` overwrite only reachable when scope entity is confirmed present
  - F3-U-5: corrected to expect `'pending'` (not `'eligible'`); deletion uses FK ON + `PRAGMA foreign_key_check` assertion proving no DB violation
  - F3-U-6 (new): teacher_class with deleted user_group → ineligible; same FK ON + foreign_key_check pattern
  - ARFL-3 (new): deleted scope + auto_release=true → allocation stays pending, funder reserved_stroops unchanged, no release transaction, no recipient account
  - F1-H-5 (new): TEMP BEFORE INSERT trigger (`RAISE(ABORT)`) forces outbox INSERT failure; staff-mark returns 500; lesson_completion + outbox row absent (full transaction rollback); retry after trigger drop → 200, allocation eligible
- **Tests**: 51/51 W04-R2 tests pass; 0 regressions
- **Independent review**: Task review (sonnet) FINDINGS — F3-U-6 FK consistency (moderate), F3-U-4 stale test name (low); Scoped re-review (haiku) APPROVED after fixes
- **Completion**: PR #125 merged `a946c0f`; PR CI run 41187941595 — 4/4 PASS; post-merge CI run 41188285283 — 4/4 PASS

---

## S3 — Reward contracts and portal completion (W05–W09)

**Git base**: Branch from `main` after S1 merges. Each fix gets its own branch and PR.
**Test commands**: Backend: `cd LMS-Server && npm run build && npx vitest run`. Frontend: `cd LMS-Frontend && npm ci && npx tsc --noEmit && npm test && npm run build`.
**Rollback**: Each W05–W09 fix is a separate PR. Revert the specific merge commit if regressions appear. W05–W09 are P2; a revert restores the current state which has DB-level guards (W05) or cosmetic/UX issues only.

### S3-T01: Implement W05 — reward type enum alignment
- **Status**: MERGED
- **Dependencies**: S1-T04 spec reviewed
- **Owner**: W05 session (2026-10-31)
- **Files**: `LMS-Server/src/services/rewards/rewardTypes.ts`, `rewardErrors.ts`, `rewardService.ts`, `LMS-Server/src/__tests__/reward-r13-routes.test.ts`, `LMS-Frontend/src/services/rewardService.ts`, `LMS-Frontend/src/components/RewardDashboard.tsx`, `LMS-Frontend/src/__tests__/components/RewardComponents.test.tsx`
- **Problem**: DB CHECK constraint allows `individual, milestone, course_completion, grade, custom`. Frontend offered `completion`/`achievement` (both invalid). `createReward()` had no runtime type validation — invalid value triggered unhandled SQLite 500.
- **Fix**: Export `REWARD_TYPES` constant and `RewardType` from backend `rewardTypes.ts`; add `INVALID_REWARD_TYPE` error code; add runtime membership validation at start of `createReward()` (before currency/scope/idempotency checks); fix frontend select to show `custom`/`individual`/`milestone`; `course_completion`/`grade` documented as requiring eligibility config not in current form; fix `RewardComponents.test.tsx` fixture from `'completion'` to `'custom'`
- **Evidence**: PR #126 MERGED, main HEAD `13c6b20`; CI: Backend Tests PASS, Frontend Tests & Build PASS, E2E Tests PASS, Offline Monitoring PASS; 29 W05 tests (W5-T1–T20) + 625 backend reward tests + 515 frontend tests all pass; independent review APPROVED
- **Spec**: `LMS-Server/docs/superpowers/specs/2026-10-31-W05-reward-type-alignment.md`
- **Acceptance**: All UI-presented types match DB enum; invalid types rejected at API level; no silent remapping; no DB writes on rejection

### S3-T01-R1: W05-R1 — safe error construction and follow-up tracking
- **Status**: MERGED
- **Dependencies**: S3-T01 MERGED
- **Owner**: W05-R1 session (2026-10-31)
- **Files**: `LMS-Server/src/services/rewards/rewardService.ts`, `LMS-Server/src/__tests__/reward-r13-routes.test.ts`, `LMS-Frontend/src/components/RewardDashboard.tsx`, `LMS-Frontend/src/services/rewardService.ts`, `LMS-Frontend/src/__tests__/components/RewardComponents.test.tsx`
- **Problem**: `createReward()` used `String(params.rewardType)` in the RewardError message. JSON objects with non-callable `toString` (e.g. `{toString:null}`) caused `String()` to throw `TypeError`, escaping to global handler → 500 instead of 400. Additionally, comments inaccurately assigned `course_completion`/`grade` form input follow-up to W06 (which is parent child/family targeting).
- **Fix**: Replace `String(params.rewardType)` with constant safe message `REWARD_TYPES.join(', ')`; remove W06 attribution from comments; add `FOLLOW-UP(course-grade-form-inputs)` references.
- **Evidence**: PR #127 MERGED, main HEAD `4ab2801`; CI: Backend Tests PASS, Frontend Tests & Build PASS, E2E Tests PASS, Offline Monitoring PASS; 12 W05-R1 tests + 637 backend reward tests all pass; independent review APPROVED
- **Spec**: `LMS-Server/docs/superpowers/specs/2026-10-31-W05-R1-error-safety.md`
- **Acceptance**: Malformed object input → 400 INVALID_REWARD_TYPE; no TypeError escapes; follow-up tracking accurate

### S3-T02: Implement W06 — family/child discriminator
- **Status**: MERGED
- **Dependencies**: S1-T04 spec reviewed
- **Owner**: W06 session (2026-10-31)
- **Files**: `LMS-Server/src/services/rewards/rewardErrors.ts`, `LMS-Server/src/routes/parent.ts`, `LMS-Server/src/__tests__/reward-parent.test.ts`, `LMS-Frontend/src/services/rewardService.ts`, `LMS-Frontend/src/components/RewardDashboard.tsx`, `LMS-Frontend/src/pages/ParentDashboard.tsx`, `LMS-Frontend/src/__tests__/components/RewardComponents.test.tsx`
- **Problem**: `resolveParentScopeType()` mapped only `'family'` → `parent_family`; invalid supplied values silently defaulted to `parent_child`. GET route unsafely cast query param. Frontend had no `targetType` in create params or list query.
- **Fix**: Added strict validation (`undefined`/`'child'`/`'family'` accepted; any other value → 400 `INVALID_TARGET_TYPE`). Removed unsafe `as string` cast. Added `INVALID_TARGET_TYPE` to error codes. Frontend: `targetType` added to `CreateRewardParams`, `listRewards`, `RewardDashboard` props, and `ParentDashboard` group rendering.
- **Evidence**: PR #128 MERGED, main HEAD `1988457`; CI: Backend Tests PASS, Frontend Tests & Build PASS, E2E Tests PASS, Offline Monitoring PASS; 25 W06 tests (20 backend + 5 frontend) + 2251/2252 backend + 523/523 frontend pass; independent review APPROVED_WITH_NOTES
- **Spec**: `LMS-Server/docs/superpowers/specs/2026-10-31-W06-parent-target-discriminator.md`
- **Acceptance**: Invalid targetType rejected before DB; omitted targetType preserves legacy; valid child/family resolved to correct scope; frontend carries targetType correctly; no W01–W05 regressions
- **Residual**: Per-child rewards UI in ParentDashboard not yet rendered (pre-existing, W08 scope)

### S3-T02-R1: W06-R1 — stale response guard in RewardDashboard
- **Status**: MERGED
- **Dependencies**: S3-T02 MERGED
- **Owner**: W06-R1 session (2026-10-31)
- **Files**: `LMS-Frontend/src/components/RewardDashboard.tsx`, `LMS-Frontend/src/__tests__/components/RewardComponents.test.tsx`
- **Problem**: `load()` committed state unconditionally — a pending old-target promise could resolve after a prop change (role/scopeId/targetType) and replace current-target data. Both stale successes and stale errors/empty results were unguarded.
- **Fix**: Added `reqIdRef` (monotonic counter) captured per `load()` invocation; all state commits (`setRewards`, `setState`, `setError`) gated on `reqIdRef.current === myReqId`. Added `targetKeyRef` (`${role}|${scopeId}|${targetType??''}`); `performAction`'s post-mutation `load()` and `setError` gated on `targetKeyRef.current === myTargetKey`. `useEffect` cleanup increments counter on dep change / unmount. `beforeEach` changed to `vi.resetAllMocks()` to flush implementation queues between deferred-promise tests.
- **Evidence**: PR #129 MERGED, main HEAD `1a5288a`; CI: Backend Tests PASS, Frontend Tests & Build PASS, E2E Tests PASS, Offline Monitoring PASS; 8 W06-R1 tests + 531/531 frontend pass; independent review APPROVED_WITH_NOTES
- **Spec**: `LMS-Server/docs/superpowers/specs/2026-10-31-W06-R1-stale-response-guard.md`
- **Acceptance**: Late stale success does not overwrite current-target data; late stale rejection does not set error on current target; performAction spinner always clears; StrictMode double-invoke safe; unmount safe

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
