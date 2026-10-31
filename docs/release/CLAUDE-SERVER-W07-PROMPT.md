# W07 — Billing DTO and permission-contract reconciliation

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 22ec76fdf803503bd2debf43a53d6137fbf40177 (documentation after #131 merge 530315e)
Last fetched planning: 012de41162e5b28cfd3f58be4caa24340fdf8c14
Scope: S3/W07 billing contracts only. W08/W09, unrelated UI features and production actions excluded.

## Read and execute

Read this entire file and execute the bounded work rather than merely summarizing it. Revalidate refs, source, checks and applicable repository instructions; preserve newer fixes. Retrieve this documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read staged INDEX/TASKS/EVIDENCE, platform audit W07 and docs/superpowers/specs/2026-10-27-W05-W09-reward-contracts.md. The old W07 brief explicitly requires investigation of exact mismatches. Its suggested sponsor.billing permission is illustrative, not an instruction to invent a permission or replace current policy without evidence.

W06 verification context: independent local run passed 44 component cases on #131 code: all 41 submitted cases plus the delayed-list, create-completion and blocked-refund revisit probes. The previously reproduced W06 defects are resolved in that scope. Preserve W01–W06 behavior. Main advanced from merge 530315e to documentation-only 22ec76f; record source/tested/merge/documentation SHAs accurately. This is not an independent full-suite/hosted-CI rerun or production certification.

## Current source findings — reproduce and inventory first

Both GET /sponsor/billing and GET /employer/billing already require billing.view_own.

Sponsor billing:
- Defaults to scope=own, selects only payments.user_id=authenticated caller.
- scope=cohort requires additional billing.view_all AND cohort.view_own, then selects payments from owned cohort members on that cohort's matching course, excluding caller's own payments.
- Accepts validated from/to day filters; uses an exclusive next-day upper boundary.
- Responds {success:true,data:{payments,total,scope}}, with snake-case payment fields plus optional joined course_name/payer_name.
- Several invalid scope/date and denied cohort errors omit error.code.
- sponsorService.getBilling maps snake_case to its camel-case view model, but directly reads res.data.data instead of its established assertApiSuccess helper.

Employer billing:
- Selects only authenticated caller's payments.
- Responds {success:true,data:{payments,total}}, with rows containing id, course_id, amount_cents, currency, payment_method, status, created_at.
- Frontend EmployerBilling instead declares paymentId, amountCents, createdAt and totalSpent, and getBilling returns res.data.data without mapping. A TypeScript assertion does not transform the wire data.
- EmployerDashboard's current billing section is a placeholder, not an implemented payment-history UI. Do not claim a fully working portal from a service fix or build that UI under W07.

Inspect actual consumers, OpenAPI/types, existing sponsor billing/receipt tests, payment status/money semantics and analogous parent/teacher endpoints before selecting a contract. Parent/teacher inspection is for policy consistency and deferred findings; do not silently expand this unit into rewriting every portal.

## Required bounded contract

Produce a route/permission/scope/DTO/error matrix before implementation. Classify each observed difference as intended scope/privacy variation, actual client mismatch, inconsistent error or stale documentation. Prove runtime mismatches with actual HTTP and frontend adapter calls; do not manufacture a defect merely because two endpoints expose different optional fields.

Preserve established read authority:
- Own payment history is caller-owned under billing.view_own; multi-role users do not get broader results simply from extra unrelated roles.
- Sponsor cohort visibility retains its existing extra capabilities AND resource/course ownership restrictions. billing.view_all does not automatically turn the sponsor route into a global payment dump.
- Do not broaden employer access to team members' payments merely to resemble sponsor cohort mode. Team membership is not payer identity or an approved new billing visibility policy.
- Preserve current receipt/payment-detail authorization, appropriate administrator identity policy and privacy boundaries. No new global-role bypass, legacy JWT-role decision or cached permission trust.

Use explicit safe wire DTOs and accurate frontend view models. Prefer preserving established response shapes with narrow client mapping over an unnecessary breaking API rename. Map actual id/course/amount/method/status/time fields deliberately. Optional joined fields may differ legitimately by endpoint and scope; do not expose payer names, email, provider references, metadata or raw SELECT * merely for DTO symmetry.

Define total accurately as the documented result count unless an existing approved contract specifies otherwise. Never relabel a count as totalSpent. Do not compute a single monetary total by summing different currencies/statuses or treating refunds/pending/failed rows as settled expenditure. If a monetary summary is genuinely required by an existing consumer, specify currency/status/units/refund semantics and test them; otherwise remove/fix the unsupported client declaration with compatibility evidence rather than invent a new aggregation feature.

Preserve integer minor units, currency codes, timestamps and real payment status/refund fields accurately. No Number(value)||0 fallback that turns malformed money into plausible spending. Null/deleted course joins must not drop valid own payments or fabricate a title; optional fields and nullability must be modeled truthfully.

For touched billing errors, use the established {success:false,error:{code,message}} envelope with stable meaningful codes and controlled status. Invalid scope/date/query shapes must not cause coercion errors or raw SQL leaks. Preserve authentication/permission-before-sensitive-data behavior. Changes to a shared date helper may also affect impact-report routes; explicitly test that coupling without redesigning those reports.

Frontend billing adapters must reject explicit API failure envelopes and propagate transport/permission errors through existing error helpers rather than returning fabricated empty history or valid-looking totals. Keep this to the billing contract boundary; W09 general loading/error rendering remains separate.

Document current date filtering support per endpoint. Do not add employer filters/pagination or new sponsor modes merely for symmetry. Preserve sponsor day inclusivity across existing SQLite/ISO timestamp representations and stable sorting/count semantics. If response pagination already exists in current main, total must match its documented meaning; do not introduce pagination as an unrelated feature.

All operations in scope are reads. They must not mutate payments, provider state, accounts, reward ledger, entitlement, ownership or permissions. No schema migration, real payment calls, refunds, billing exports feature or provider/credit enablement.

## Development and independent review

Use an isolated codex/ branch/worktree from verified main and disposable synthetic SQLite. Preserve unrelated work. Discover relevant installed skills honestly; missing optional tools are not blockers. No unreviewed hooks/proxies/scripts.

Before coding, commit a focused spec, checkbox TDD plan and requirement-to-test matrix with current/intended wire and frontend DTO examples, role/resource policy, optional/null fields, totals/money semantics, errors and compatibility. Include Mermaid request→permission→scoped query→wire DTO→client adapter flow. Use independent agents for design and code/security review; resolve valid findings and routine decisions autonomously.

Behavioral TDD minimum:
1. Actual employer billing HTTP payload passed through the real frontend adapter exposes correctly named/mapped payment id, amount, currency/status/time and count, with no imaginary totalSpent. Reproduce current mismatch RED; do not mock the wire response to the desired view shape.
2. Sponsor own and cohort payloads map correctly with optional course/payer fields; empty successful history is distinct from API failure. Verify null/deleted-course joins and no extra sensitive fields.
3. Role-only sponsor/employer own-payment positives and unrelated payer negatives, multi-role learner/staff accounts, unauthenticated, missing permission and revoked permission/session. Assert exact effective grants and actual returned row IDs.
4. Cohort matrix: both extra permissions plus correct owned cohort/member/course succeeds; missing each permission, unrelated cohort/course/member and transferred/revoked ownership fail or exclude appropriately. Duplicate membership cannot duplicate billing entries or totals.
5. Receipts/payment details for authorized own and permitted cohort payments still work; foreign resources remain denied. Use existing documented authorization semantics, not new broad access to align endpoints.
6. Scope/date/query validation including arrays/objects/repeated conflicting params, invalid dates and reversed ranges: controlled coded errors, no coercion crash/raw SQL; preserve valid inclusive day boundaries and stable ordering. Do not extend unsupported filters silently.
7. Real frontend adapter successful/empty/error/403 cases for touched endpoints. Explicit success:false is not treated as successful history. Money units, mixed currencies, statuses and optional null fields remain exact; count is never displayed/typed as currency.
8. At least one contract integration spanning actual backend payload and frontend adapter (or equivalent synthetic E2E) catches snake/camel mismatch. A constant/type-only test or mocked camel-case response cannot establish wire compatibility.
9. Read-only proof: relevant payments/accounts/ledger/entitlement/permission rows unchanged after valid/invalid/denied billing reads. No live provider/network dependency.
10. Existing sponsor date/receipt/billing semantics and employer routes, plus W01–W06 reward/security regressions remain passing. Shared helper changes receive focused existing-consumer coverage.

Use actual code, precise response/state assertions and deterministic synthetic fixtures. Runner/import failures are not behavioral RED. Existing green tests do not replace exact missing-contract reproductions.

Run focused RED/GREEN, affected billing/payment/receipt/RBAC/cohort/employer and frontend service/consumer tests, backend/frontend typechecks/builds and relevant integration/E2E plus required fresh candidate CI. Broaden tests as repository policy or demonstrated coupling requires. Establish unrelated failures independently before classification; do not suppress checks to claim green.

Independent review must inspect resource-level privacy, monetary/count semantics, backward-compatible wire mapping and actual HTTP→adapter negative/positive evidence. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR describing concrete mismatches, intended scoped differences, DTO/error corrections and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W07 spec/plan with exact baseline/candidate/review/merge SHAs, RED/GREEN, counts/skips, route/permission/DTO matrix, reviews and candidate/main CI receipts. Correct historical sponsor.billing suggestions and claims of inconsistency where current policy is already sound; preserve W01–W06 receipts. Mark W07 complete only for demonstrated acceptance; S3 remains in progress with W08/W09 pending.

Track employer placeholder UI, any other portal DTO findings and FOLLOW-UP(course-grade-form-inputs) separately. Do not mark those implemented because a billing service contract now works. No deployment, live migration, real payments/refunds, provider/credit enablement or historical reconciliation; existing operational gates remain separate.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion, cancel stale monitors and save tasks/evidence/SHAs and exact resume action before exhaustion. Missing indispensable evidence means CHECKPOINTED.

STOP after W07. Return UNIT_COMPLETE or CHECKPOINTED with qualified W07 acceptance, limitations and next handover. Do not begin W08/W09, deploy, apply live migrations, merge unrelated work or modify real financial state.
