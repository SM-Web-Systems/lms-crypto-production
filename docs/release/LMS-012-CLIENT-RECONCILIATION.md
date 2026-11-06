# LMS-012 — web and mobile RBAC client reconciliation

Status: **in progress**, 6 November 2026. The local client changes are reconciled from [PR #100](https://github.com/SM-Web-Systems/lms-crypto-production/pull/100), head `9bb88b056e2d968c5298c876ab32e166c8032aa6`, onto the completion branch. Its old green CI is historical evidence, not acceptance of this candidate.

Web and native sessions discard the single legacy display hint on every verified replacement. Role badges show all exact current assignment labels, with current RBAC names as a transitional-server fallback. No role-name substring or legacy label supplies access. Route/gate props describe workspaces separately from extensible assignment names. Native messaging uses the returned directory capability. Submission history uses learner-profile IDs independently of staff/learner role labels.

Three client conflicts were resolved: keep current search naming/focus containment while showing assignment labels; keep the newer unsupported billing/wallet route redirects while changing workspace prop names; keep both delayed-logout race coverage and the new foreground authorization replacement case. Current cold native getter preloading, mock isolation, dependency adapters and patched lockfiles remain intact. Shared native source resolves helpers against the mobile lockfile.

Mobile CI now also triggers for shared presentation/type changes and exports both Android and iOS against loopback-only service URLs. It extends the existing pinned mobile acceptance workflow; the older PR's duplicate standalone job will not replace the current dependency/tooling/isolation checks.

Local client validation: **711 web tests**, production web build, **163 native tests**, native TypeScript and both Android/iOS Hermes exports pass. The first web run had 710 passing and one stale sponsor-report label assertion from the earlier reporting change; it now expects the documented sponsored-membership metric, and all 711 pass. Original receipts remain preserved. These exports are JavaScript bundles, not signed binaries or physical-device results.

Next: finish the additive API role-summary/learner contracts from the same PR, run scoped API and browser acceptance on the combined candidate, and retain actual installed-build/previous-binary acceptance as an open gate. LMS-010's private inventory decisions and LMS-011's final candidate acceptance remain required before any cutover/release.
