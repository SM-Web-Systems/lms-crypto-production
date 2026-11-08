# LMS-006 — accessible mobile web controls

Search and Logout have explicit accessible names at compact widths. The search dialog and its input/close control are named, focus enters immediately, Tab/Shift+Tab wrap inside the dialog, and Escape restores the prior focus. The trigger remains mounted so focus can return to it. Dialog margins and a shrinkable input preserve usable space at 320px.

The existing sponsor tab keyboard behavior remains reachable through Billing and its receipt action. Native sponsor workspaces remain a web handoff; this change accepts the responsive web controls.

## Validation — 6 November 2026

- Full frontend suite: **703/703 passed**, including search focus regression and sponsor accessibility cases.
- Frontend TypeScript and production build passed.
- Chromium, retries disabled: **3/3 passed** at **320, 390 and 768px**. Each case checks named Search/Logout, dialog focus wrapping, Escape focus restoration, End navigation to Billing, receipt focus and absence of document overflow.
- Tests use the disposable local database and built app with the LMS-007 authentication fixture changes. This is local browser acceptance, not physical-device or staging account acceptance.

See [validation receipt](evidence/lms-006-validation.json) for source and raw-result hashes. Original audit evidence remains unchanged. The two edited search files also normalize their previously mixed stored newlines.

## Cross-browser follow-up — 6 November 2026

LMS-022 found a WebKit pointer-focus difference: opening Search can leave the page body as the previous active element. Closing now returns to the persistent Search trigger for body/root focus, while keyboard shortcut activation still restores the actual prior control. Two unit regressions cover both paths. Follow-up validation passes 713 web tests, 40 Firefox/WebKit sponsor/RBAC cases and all 83 Chromium cases, with retries disabled. See [cross-browser evidence](LMS-022-CROSS-BROWSER-ACCEPTANCE.md); physical Safari/iOS acceptance remains separate.
