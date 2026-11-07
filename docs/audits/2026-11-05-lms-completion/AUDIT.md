# LMS test and outstanding-work report — 5 November 2026

**Assessment: substantial functionality is implemented, but the three deliverables are not all ready for final acceptance.** Sponsor reporting and billing worked in the tested scenarios. Mobile passed local acceptance and bundle export, but physical-device acceptance remains open. RBAC administration works, while 13 deliberately documented RBAC-only target gaps remain in current application code.

## Scope and version

- Tested a Git archive of current main: `e1929c2c401511a793d03526391a3bb9e8d96ac1`, with clean locked installs for API, web, mobile and E2E. The original checkout remains on its original branch. The initial [Windows export comparison](evidence/source-verification-windows-export.json) found only CRLF conversion in 1,471 files, with all four lockfiles JSON-identical and no other content differences. That conversion broke newline-sensitive migration fixtures. Before the focused backend retest, the isolated source was restored from raw Git blobs; the final [source comparison](evidence/source-verification.json) confirms all 2,503 tracked files and four lockfiles are now byte-identical. This is a Windows source/build test, not a production-image rehearsal.
- Public production health at `https://lms.smwebsystems.com/api/v1/health` returned HTTP 200, DB OK, writer hold inactive and build `f5a64e8ac92aca6b33ae54bda70617d475893e3e`. The Wallet network is public.
- Git comparison shows the deployed build and tested main have the same LMS API/web/mobile application source. The ten later changed files concern CI, monitoring, release recovery and compose log settings. This does not identify the installed mobile binary or attest to every production configuration.
- Production checks were read-only: health, anonymous courses rejection and public landing/login layout. Authenticated workflows used disposable local fixtures with external provider networking blocked.
- Runtime: Windows, Node 22.18.0, npm 11.11.0. No product implementation changes, merge, deployment, production role changes, charges, refunds or chain transactions were made.
- Hosted current-main [CI](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/41918032626) and [mobile local acceptance](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/41918032458) were independently checked and all their jobs passed. The local results below are additional evidence.

## Results from this audit

| Check | Result | Evidence |
|---|---|---|
| Complete backend suite, initial Windows export | 2,247 PASS, 4 FAIL, 1 protected-copy skip; migration suite setup also failed; corrected retest below | [JSON](evidence/server-tests-rerun.json), [log](evidence/server-tests-rerun.txt) |
| Failed backend groups after exact-byte source restoration | 170 PASS, 1 Windows writer-hold FAIL, 171 total; all migration failures cleared | [JSON](evidence/backend-focused-retest.json), [log](evidence/backend-focused-retest.txt) |
| Backend TypeScript build | PASS | [Build log](evidence/server-build.txt) |
| Source-free compiled bootstrap | PASS | [Log](evidence/compiled-bootstrap-rerun.txt) |
| Offline RBAC inventory | 8/8 PASS | [Log](evidence/rbac-inventory.txt) |
| Explicit RBAC-only targets | 21 PASS, 13 FAIL, deliberately enforced known-gap assertions | [JSON](evidence/rbac-target-contracts.json) |
| Complete web suite | 702/702 PASS, no skips | [JSON](evidence/frontend-tests.json) |
| Web TypeScript/production build and size budget | PASS | [Build](evidence/frontend-build.txt), [size](evidence/frontend-size.txt) |
| Browser suite | 71/73 first run; remaining 2/2 PASS on focused retry, no skipped tests | [Initial JSON](evidence/e2e-results.json), [retry JSON](evidence/e2e-retry-results.json) |
| Sponsor browser authorization group | 10/10 PASS, with the coverage caveat below | Included in initial browser JSON |
| Mobile local acceptance | Final standard run: 158/158 Jest tests, 17 suites; 3 evidence-checker tests; TypeScript PASS | [Final log](evidence/mobile-acceptance-final.txt) |
| Mobile session diagnostic | All 18 PASS; subsequent isolated standard-timeout run also 18/18 PASS | [Standard JSON](evidence/mobile-session-standard.json), [diagnostic JSON](evidence/mobile-session-diagnostic.json) |
| Android and iOS JavaScript/Hermes exports | PASS for both platforms | [Export log](evidence/mobile-bundle.txt) |
| Offline EAS startup/profile compatibility | 5/5 PASS; CLI 25.3.0, four build profiles/eight platform profiles | [Log](evidence/mobile-tooling.txt) |
| Local Android target/device configuration guards | 5/5 PASS | [Log](evidence/mobile-local-setup.txt) |
| Local service isolation/settings/fixture guards | 8/8 PASS outside sandbox | [Log](evidence/local-services-tests-rerun.txt) |
| Offline monitoring/release/recovery Python suite | 248 PASS, 3 platform skips, 251 total | [Log](evidence/monitoring-tests-rerun.txt) |
| Shell monitoring checks | 14/14 PASS | [Log](evidence/monitoring-shell.txt) |
| Deployment/rollback/smoke shell entrypoint checks | PASS with explicit installed Windows Python path | [Log](evidence/shell-tests-rerun.txt) |
| Smoke-verifier behavior | 12/12 PASS, synthetic curl responses | [Log](evidence/smoke-verify.txt) |
| Synthetic SQLite WAL restore drill | PASS; integrity/FKs OK and source rows unchanged | [Log](evidence/restore-drill.txt) |
| E2E harness/BVC validator typechecks | PASS | [E2E](evidence/e2e-typecheck.txt), [BVC](evidence/bvc-typecheck.txt) |
| E2E provider-network guard | 3/3 PASS | [Log](evidence/network-guard-tests.txt) |
| Fresh dependency audit | Web: 0; API: 5 moderate; mobile: 9 low / 25 moderate / 9 high / 0 critical | [Web](evidence/frontend-audit.json), [API](evidence/server-audit.json), [mobile](evidence/mobile-audit.json) |

**Retry interpretation:** two admin E2E tests timed out in the fixture's initial page navigation, then passed with original assertions and deadlines on a one-worker retry. Two full mobile attempts reported the same three session-test failures; the first timed out and the following failures were consistent with a cascade. The isolated group passed with a diagnostic longer deadline, then at its original deadline, followed by a full 158/158 standard run. These are reproducible test-reliability concerns, not evidence that the initial runs passed. No assertion, test source or production code was changed.

The first backend run was stopped because the sandbox does not allow the loopback sockets used by HTTP tests. The compiled-bootstrap link and one local socket guard also needed an outside-sandbox rerun. Shell checks initially resolved an unavailable `python3` launcher; setting the existing `LMS_PYTHON_BIN` option to the installed Python fixed that check. Initial logs remain alongside successful reruns.

The ordinary backend run completed with 2,247 passing assertions, four failing assertions and one protected-copy skip; the newline-sensitive migration suite also failed during setup. Three assertion failures and the setup failure concern CRLF-sensitive SQL fixture construction. Their focused raw-blob retest is recorded separately below. The remaining writer-hold failure is a Windows path-error difference, not a POSIX permission test: when the parent of the hold path is a regular file, Windows returns `ENOENT`. Current `isWriterHoldActive()` treats that as absence and returns false, while the test expects the invalid state to count as held. A [standalone probe](evidence/writer-hold-windows-probe.json) reproduces this OS error and result. Current Linux hosted CI passes the same test, but the Windows fail-closed contract needs a portability fix/test. No deployment or runtime outage is inferred from this synthetic case.

The focused raw-blob retest executed 171 assertions: **170 passed and one failed**, with no skips. Both migration groups passed completely. The only remaining failure is the Windows writer-hold path case above. The full ordinary suite was not rerun a third time, and this report does not label the local backend entirely green. The separately enforced 13 RBAC target failures are confirmed incomplete behavior rather than export-related failures.

## Mobile — implemented and outstanding

**Implemented and locally verified:** Wallet SSO/PKCE callback handling, session restoration and revocation behavior, account controls, student course reader/media/quiz/assignment paths, server-backed progress/resume, certificate list/detail, downloads/sharing logic and permission-based workspace handoffs. The full native test suite and Android/iOS JS exports pass.

Native screens primarily serve student learning. Sponsors, administrators, instructors, TAs, employers, parents and teachers use explicit web handoffs. Multi-role accounts can retain student learning and open another workspace on web. A native sponsor dashboard is not present; this is the documented design.

**Outstanding:**

1. Installed **physical Android and physical iOS** acceptance, including real browser callback lifecycle, foreground/restart/revocation, learning/media playback, document permissions/sharing, large text and TalkBack/VoiceOver. No such device session was run in this audit. JS exports are not APK/AAB/IPA builds or device verification.
2. Exact app binary/build hash, API/Wallet versions, device/OS, tester, timestamp and redacted evidence for all eight acceptance groups. The committed [device report template](https://github.com/SM-Web-Systems/lms-crypto-production/blob/e1929c2c401511a793d03526391a3bb9e8d96ac1/LMS-Mobile/acceptance/device-report.template.json) is still unfilled; use the [current acceptance guide](https://github.com/SM-Web-Systems/lms-crypto-production/blob/e1929c2c401511a793d03526391a3bb9e8d96ac1/docs/release/mobile-device-acceptance-followup.md). The old draft [PR #62](https://github.com/SM-Web-Systems/lms-crypto-production/pull/62) is historical documentation, not current device acceptance.
3. Dependency cleanup: **43 graph findings — 9 high, 25 moderate, 9 low, 0 critical**. High findings involve EAS/tooling and the Router dependency graph, including follow-redirects, image-size, Joi, node-forge and decode-uri-component. Exposure differs by runtime/tooling; the audit does not prove exploitability in a shipped native app. Current CI rejects critical findings, so its success does not mean the graph is clean. Review compatible updates and repeat acceptance/bundles without blindly applying the suggested major changes.
4. Resolve cold-run session-test sensitivity and retain the original meaningful assertions.
5. Push notifications and durable offline content/progress are explicitly roadmap work. Failed progress writes are retryable while the reader remains mounted; that queue is not durable offline storage.
6. Native distribution/release acceptance remains separate from the merged local Android development environment. Existing emulator setup/local-services work is implemented, but it does not close physical iOS/Android acceptance.

## RBAC — implemented and outstanding

**Implemented:** role administration, grant/remove UI, permission/capability checks, workspace access, scoped sponsor boundaries and the offline role inventory tool. I used the synthetic super-admin UI to add Teacher to a disposable student, observed Student + Teacher, removed Teacher, and observed Student only. The synthetic sponsor was refused `/admin/users` with “Access unavailable.”

**Important:** a green ordinary backend suite is not proof that legacy-role retirement is complete. The Step 1 suite intentionally wraps 13 target assertions in `it.fails`. Running the repository's supported `RBAC_ENFORCE_TARGETS=1` mode produced **13 actual failures**, while its other 21 assertions passed.

| Remaining target group | Confirmed behavior in synthetic fixtures | Targets |
|---|---|---|
| Teaching eligibility | A current instructor with legacy student text, and a delegated teaching-capability account, are rejected; a legacy lecturer without current teaching grants can be assigned | 3 |
| Certificate self-application | Legacy admin/lecturer text bypasses the target enrollment rule; a zero-grant legacy lecturer can apply even when the target says deny | 3 |
| Broadcast audiences | Sponsor, instructor and enhanced-student audiences still depend on legacy text in the tested paths | 3 |
| Multi-role password login | Learner-profile ID is missing from the tested multi-role token scenario | 1 |
| Explicit initial provisioning | Removing the legacy auto-assignment trigger leaves tested Wallet/public-registration creations without the intended explicit grants | 3 |

The certificate findings concern **application eligibility**; this audit does not claim they automatically issue or mint a certificate.

[PR #98](https://github.com/SM-Web-Systems/lms-crypto-production/pull/98), inventory and policy tests, is merged. The remaining implementation exists in open stacked PRs:

- [#99 — backend RBAC-only cutover](https://github.com/SM-Web-Systems/lms-crypto-production/pull/99).
- [#100 — web/mobile client retirement](https://github.com/SM-Web-Systems/lms-crypto-production/pull/100).
- [#101 — legacy schema/compatibility removal](https://github.com/SM-Web-Systems/lms-crypto-production/pull/101).

These PRs were inspected for scope/status; this audit did not run their complete branches or approve their production migrations. Reconcile them sequentially with current main and rerun exact-candidate tests. Their earlier CI evidence predates subsequent main changes. Required cutover evidence includes accepted production account/usage inventory, supported/retired client versions, protected-copy migration rehearsals and compatible recovery images. Step 2 invalidates sessions; Step 4 contracts the schema and must not be treated as an ordinary reversible UI release.

The current role-manager directory still displays **Legacy Role** — e.g. a sponsor fixture appears as student there while its effective workspace is sponsor. The selected role panel shows actual RBAC grants. Client/UI retirement in #100 remains outstanding.

## Sponsor portal — implemented and verified

The following worked against the local running API and synthetic fixture:

- Sponsor login and default routing; Overview, Impact and Billing rendering.
- Owned-cohort metrics; another sponsor's cohort/payment/badge access rejected by the E2E group.
- Impact report showing the owned cohort, date controls and invalid from/to feedback.
- Downloaded impact CSV contained one cohort, one member and the expected zero completion/certificate counts.
- Billing correctly separated **Your payments** (empty fixture) from **Cohort member payments** (one confirmed USD 50 fixture), rather than attributing the member's payment to the sponsor.
- Authorized receipt downloaded as a PDF; unauthorized payment/badge boundaries passed in E2E.
- At 390px, login and sponsor pages did not expand the document beyond the viewport. Sponsor tabs and wide tables scroll horizontally; I reached the later Billing tab and receipt action.
- Sponsor access to admin role management was refused.

Evidence: [phone billing screenshot](evidence/sponsor-billing-mobile-390.png), [production phone login](evidence/production-login-mobile-390.png), [impact CSV](evidence/downloads/impact-report-2026-11-05.csv), [synthetic receipt](evidence/downloads/receipt-e2e-payment-cohort-a.pdf), the [manual observation record](evidence/manual-checks.json).

**Outstanding:**

1. Add a real revocation lifecycle browser test. `SPNS-E2E-10` is titled “Revoked sponsor membership removes cohort access” but only checks that A's cohort list includes A and excludes B. It neither revokes membership/ownership nor tests a previously authorized session afterwards. Its pass must not be counted as revocation evidence.
2. Complete signed-off staging acceptance with realistic multiple cohorts, currencies, date boundaries, paid/completed/certified learners and reconciliation against authoritative records. This audit used deterministic fixtures; it did not establish production financial/reporting accuracy for customer data.
3. Complete provider acceptance separately. Stellar reward funding currently refuses because transaction verification is not configured; platform-credit funding refuses because provisioning is absent; XLM rewards have no fiat-to-XLM Paystack settlement path. Independently authorized admin-grant funding is a different supported path. Do not describe all external reward funding as complete. Existing course payments and mocked payment/webhook regressions are separate from this reward-funding gap.
4. Add accessible names to shared phone-width **Search** and **Logout** buttons. At 390px their text is hidden and the accessibility snapshot exposes unnamed buttons. Source: [GlobalSearchBar.tsx](https://github.com/SM-Web-Systems/lms-crypto-production/blob/e1929c2c401511a793d03526391a3bb9e8d96ac1/LMS-Frontend/src/components/GlobalSearchBar.tsx), trigger around line 89; [Layout.tsx](https://github.com/SM-Web-Systems/lms-crypto-production/blob/e1929c2c401511a793d03526391a3bb9e8d96ac1/LMS-Frontend/src/components/Layout.tsx), logout around line 246. This affects the mobile web experience across workspaces.
5. Update stale evidence/backlog documents. October sponsor CI documents still list 26–28 old E2E failures and no sponsor E2E coverage; current source contains the sponsor suite and current hosted CI is green. Preserve those documents as historical evidence, but link a current status report.

## Recommended order of work

| Priority | Work | Completion evidence |
|---|---|---|
| P1 | Resolve RBAC application/teaching eligibility gaps and carry out the reviewed #99 → #100 → #101 process | All 13 enforced targets pass on reconciled candidates; account/client inventory and migration/recovery rehearsals accepted |
| P1 | Close mobile dependency high findings with reviewed compatible changes | Fresh lockfile audit, full mobile acceptance and bundle/native compatibility checks |
| P1 release gate | Complete physical Android/iOS acceptance | Reviewed installed-binary/device evidence for every required group |
| P2 | Fix phone Search/Logout accessible names | Accessible names visible at phone widths; keyboard/screen-reader checks |
| P2 | Add actual sponsor revocation lifecycle coverage and stabilize cold-start tests | Meaningful regression assertions pass at normal deadlines |
| P2 | Make invalid writer-hold path handling consistent on Windows | Invalid parent-file state remains held; actual missing hold file remains unheld |
| P2 feature gate | Finish external reward-funding verification/settlement and staging reconciliation if included in launch scope | Provider-specific end-to-end evidence; no unsupported funding presented as available |
| P3 | Reconcile historical docs and confirm push/offline roadmap scope | Current evidence index and explicit accepted scope |

## Limits

This is a broad automated and targeted browser audit, not a claim that every manual scenario or device has been certified. No physical phone, iOS simulator, installed binary, real Wallet authentication/CAPTCHA/2FA recovery, email/SMS delivery, real charge/refund, mainnet mint/transfer or production database inventory was exercised here. No private production snapshot was available; the existing protected-copy backend test may be skipped when its private input is absent. Safari/Firefox/device-specific rendering and installed-client compatibility remain unverified locally.

Public health is a point-in-time observation. The public root `/health` returned website HTML; use `/api/v1/health` for the JSON API observation. That routing difference is not by itself an API outage.

Committed evidence is indexed by [manifest](evidence/manifest.json). JSON test reports retain counts, individual assertion outcomes and first-line failure summaries; verbose stacks/browser configuration were omitted and local paths sanitized. Logs are stored as text files; screenshots and synthetic downloads are byte copies. The manifest records hashes of original local receipts and committed representations. Original receipts, export, dependencies, caches and runtime files remain outside this committed packet in `output/playwright/lms-audit-2026-11-05/`. [Remote evidence](evidence/remote-evidence.json) records checked PRs, current-main hosted jobs and the public build observation; [manual observations](evidence/manual-checks.json) record browser checks. The original product checkout was not edited. Only the isolated exported source's line endings were restored for the migration retest.


## Completion direction

The executable completion sequence and closure criteria are in the [completion plan](../../release/LMS-COMPLETION-PLAN-2026-11-05.md), with task state in its linked backlog. Planning does not close these findings.
