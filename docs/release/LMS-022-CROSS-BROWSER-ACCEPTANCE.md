# LMS-022 — sponsor and RBAC cross-browser acceptance

Status: **in progress**. Local synthetic acceptance is complete for this phase; staging sign-off remains open. Updated 6 November 2026.

The local Playwright harness now supports opt-in Firefox and WebKit projects with `E2E_CROSS_BROWSER=1`; its default Chromium project is unchanged. All browsers remain confined to the disposable loopback API/web services, with service workers blocked. Provider traffic and real accounts/payments are excluded by the existing fixture guards.

The first Firefox attempt exposed forced JSON `Accept` headers on document navigation. Firefox respected that header and Vite correctly declined its HTML fallback, returning 404. The fixture now lets browsers negotiate document content and retains its authorization header. API clients continue requesting their own JSON responses. No product routing change was needed.

The next two-engine run passed 37/40 and exposed a real WebKit focus-restoration bug at all three widths. Pointer activation can leave focus on the page body, which is connected but is not a useful return target. Search now restores its persistent trigger in that case; a keyboard shortcut still returns to the actual previous control. Two unit regressions distinguish those behaviors.

Final validation: **713 web tests pass**; **40/40 Firefox/WebKit sponsor and RBAC cases pass**; the complete **83/83 Chromium suite passes**, with zero flaky cases and retries disabled. The browser runs build and serve the production web bundle. Final E2E TypeScript passes. Coverage includes 320/390/768px layouts, search focus containment/restoration, keyboard tabs/receipts, actual custom/multiple/zero grant lifecycle, sponsor scope and revocation, quantitative API/UI/downloaded CSV reports, mixed currencies, date boundaries and request retry/empty states.

The original interrupted Firefox logs and 37-pass/3-fail WebKit receipt remain preserved alongside corrected receipts; see [validation evidence](evidence/lms-022-validation.json). Desktop Playwright WebKit is engine-level evidence, not physical Safari/iOS acceptance.

Remaining acceptance: provisioned authorized staging accounts/fixtures, staging sign-off across the supported browser/device matrix, Wallet/provider integration and actual signed native binaries/physical devices. No staging role changes or provider transactions were performed by these local tests. Keep LMS-022 open until those gates are accepted.
