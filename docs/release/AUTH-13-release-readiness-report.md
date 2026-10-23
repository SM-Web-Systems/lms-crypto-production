# AUTH-13 release readiness

Status: implementation prepared locally; draft review branches; no merge/deployment/production verification. The payment/monitoring implementation is in draft #80; its integrated CI is in progress. This report does not close AUTH-12.

## Review stack and baseline

| Area | Branch / commit | Review |
| --- | --- | --- |
| Original platform/Wallet follow-up | `codex/platform-audit-remediation`, `bbf17a0` | draft #77; dependency, unmerged |
| Safe database bootstrap | `codex/auth13-database-bootstrap`, `a594056` | draft #78; CI 39942642653 passed |
| Explicit authorization policy | `codex/auth13-authorization-policy`, `4a48674` | draft #79; CI 39944137060 passed |
| Payment/monitoring/recovery | `codex/auth13-payment-monitoring` | draft #80, implementation `e48f5e6`; CI 39947724814 running |
| Wallet verified-email integration | Wallet `04c3f0c` | Wallet draft #2; no AUTH-13 source edits |

Verified main remains `bef8653`. Production `6763f4e` is historical reported state, not re-inspected here. Stack order is #77 → #78 → #79 → #80. Review diffs against each preceding branch. Do not merge a dependent PR before its base; retarget only after maintainers merge dependencies and revalidate the combined diff.

## Backlog reconciliation

| Findings | Implementation disposition | Outstanding gate |
| --- | --- | --- |
| DB-01–05 | Explicit canonical compiled initialization; no demonstration accounts; read-only preflight; additive transaction; full/partial keys and role-trigger validation; no startup table rebuilds | Protected-copy compatibility and actual Docker runtime/volume test |
| AZ-01–03 | Shared explicit administrator policy, bound permission cache, scoped resource access; email promotion removed; trigger audit; effective operator provisioning | Human review and operational provisioning controls |
| AZ-04 / #68 | Existing five-route sponsor fix reconfirmed and strengthened against delegated permissions | Maintainer issue reconciliation; issue remains open |
| AZ-05 | Preserved existing #77 revocation/effective context/Wallet fixes | Dependency PR remains unmerged/undeployed |
| PAY-01 / #67 | Fresh synthetic E2E HMAC, real payment-state and negative/duplicate/retry tests, no repository-secret dependency | Required merge-gate enforcement unverified; issue remains open |
| PAY-02 (new) | Atomic event/state writes, event-specific deduplication, official-shaped refunds and legacy retry recovery | Owner reconciles historical suppressed refund/failed-marker cases; no customer data inspected |
| PAY-03 (explicit limitation) | Partial refunds retained as durable manual-reconciliation evidence | Cumulative partial-refund ledger/UI is a separate product task |
| MON-01/02 | Offline complete-evidence verifier, versioned UTC monitor output, fail-closed reads/exit codes and heartbeat/mail semantics | Live observation and mail receipt; historical missing fields stay incomplete |
| OPS-01 | Synthetic WAL backup/restore/corruption drill passes; retention contradictions documented | Real retention/off-host continuity and protected production restore drill |
| OPS-02/03 | Environment-file secrets accepted residual risk; capability/frontend filesystem work deferred | AUTH-14 infrastructure release |
| DEP-01 | Fresh npm advisory inventory, no dependency version/lock changes | Dedicated vulnerability triage/upgrade release; not cleared by AUTH-13 |
| MOB-01 / WAL-01/02 | Existing local tests and integration preserved | Physical devices, live email/provider configuration, SSO cache scaling and Wallet runtime roadmap |

Full original evidence/classification/acceptance is in `AUTH-13-assessment-findings.md`. Independent read-only reviews found and resolved: missing full/partial uniqueness checks, stale bootstrap instructions, delegated-creator access regression, missing/modified role trigger, genuine refund payload mismatch and stuck legacy markers. Final reviewer reports no remaining actionable findings in the reviewed code.

## Executed validation

| Check | Result |
| --- | --- |
| New bootstrap and policy combined selection | 42 passed; API build and source-free compiled smoke passed |
| Sponsor/payment, revocation/Wallet, tenant/course selections | 95 / 107 / 57 passed respectively; selections overlap |
| Payment-integrity selection | 46 passed across three files |
| Full API regression | Running locally; final integrated CI pending |
| Full web tests | 515 passed across 55 files; one async-navigation test race corrected; bounded-worker rerun passed |
| Mobile regression | 153 passed across 16 suites; TypeScript passed |
| Full local Chromium E2E | 73 passed, including five new real webhook-state checks; E2E TypeScript passed |
| Offline monitoring/verifier/exporter/command fixtures | 25 passed; no live service calls |
| Existing monitoring syntax/inventory | 14 passed |
| Deployment/rollback syntax and isolated smoke verifier | 10 and 12 passed; smoke verifier now intercepts every HTTP request |
| External HTTP transport guard | 3 passed |
| Synthetic WAL backup/restore | PASS; exact restored rows, FK/integrity checks, unchanged source and corrupt-snapshot rejection |
| Docker runtime and installed devices | Not executed; Docker unavailable locally, devices are human acceptance |

The initial API run encountered removed/obsolete guard assertions; they were replaced with actual process/FK behavior. Initial new authorization/webhook tests reproduced 11 and 8 defects respectively. An early web run hit a timeout and a delayed-navigation assertion race; the latter now awaits navigation. These early failures are not presented as final passing evidence.

## Dependency impact

No package dependency or lockfile upgrades were introduced. Fresh `npm audit --json` on 2026-10-23 reported API 22 advisories (2 critical, 11 high, 9 moderate), web 19 (1 critical, 12 high, 5 moderate, 1 low), mobile 96 (2 critical, 70 high, 23 moderate, 1 low). These counts include transitive/dev graph entries and are not a count of exploitable production paths. Critical entries include API `dompurify`/`proxy-addr`, web `dompurify`, mobile `shell-quote`/`tar`. E2E locked install audit reported zero.

Existing audit CI steps remain nonblocking. Advisory triage is a material release risk and must be assessed independently; AUTH-13 is not a claim of zero vulnerabilities. Existing twelve dependency PRs remain separate, avoiding unreviewed bulk upgrades.

## Deployment and rollback decision

This task authorizes local code/tests/draft PRs only. Before any separately authorized rollout, the owner must complete human review, verify required CI merge gates, preserve a verified database/online backup, test this preflight against a protected current-data copy, verify Docker UID/read-only/writable mounts and compiled layout, reconcile payment history/partial refunds, and complete the existing Wallet/device/configuration acceptance.

Normal startup will refuse unsupported legacy shapes. Never delete a database/sidecar, bypass preflight, run demo seed scripts or invoke initialization to repair existing data. A legacy upgrade needs a separately reviewed offline migration. Initialization targets a new empty namespace only, refusing existing/zero-byte files and sidecars.

Rollback is an owner-controlled operation: stop/drain application writes and webhook delivery, preserve current DB/WAL/SHM/journal evidence, and assess image/schema/payment-event compatibility. New composite webhook markers are not understood by the older reference-only handler; blind downgrade can restore the refund-suppression defect. Prefer a forward fix or compatible reviewed rollback image, and reconcile provider state before replaying events. Restore only a verified compatible snapshot when required; never use automatic initialization or unreviewed DROP/rebuild scripts. Do not automatically revoke existing explicit owner grants or reverse financial transactions.

After deployment, start a separately evidenced observation window. Actual production backups, mail receipts, full 24-hour coverage, installed devices and live Wallet/provider tests remain unverified here. None of the branches is marked merged, deployed or production verified.
