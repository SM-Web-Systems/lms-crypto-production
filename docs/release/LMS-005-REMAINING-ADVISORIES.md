# LMS-005 — remaining dependency findings

Status: **in progress**, with an unresolved upstream low advisory. This task is not accepted as complete.

## Mobile patch phase — 6 November 2026

The clean installed graph has **0 critical, 0 high, 0 moderate and 23 low** findings. The 23 low entries are one direct `deepmerge` advisory and its dependency chains, not 23 separate root vulnerabilities. The previous graph had 27 moderate and 9 low entries.

Consumer-scoped overrides select glob 14.0.2, minimatch 11.0.1, UUID 11.1.1 and diff 8.0.3 while retaining unaffected older APIs where needed. Broad version-range overrides produced stale nested resolutions and a lock that npm ci rejected. They were replaced by explicit consumer overrides, followed by successful clean npm 10.9.9 installation.

EAS CLI's default callable ts-deepmerge API differs from patched 8.0.0's named `merge` export. A small local adapter exports the unmodified upstream function, retained as an auditable npm alias. The regression runs the actual EAS project-config generator offline against a temporary synthetic project and checks nested values and hostile prototype-method input. No EAS account or cloud project is changed.

All seven dependency checks, five offline tooling checks, TypeScript, 159 native assertions and both Android/iOS Metro exports pass. Glob matching/cancellation is checked from actual nested Expo/Sucrase resolution paths, with native Windows path separators. UUID generation uses the actual Xcode consumer. Diff patch round trips and Router/Metro compatibility remain covered. These are local graph checks, not signed-device acceptance.

## Open finding

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) identifies prototype poisoning in deepmerge 4.2.0–4.3.1 and lists no patched version. npm currently publishes 4.3.1 as latest. No downgrade, advisory suppression, locally renamed parser/merger implementation, or SDK migration is used to erase that finding. Keep this task and the final dependency acceptance gate open until a reviewed upstream fix or a tested replacement of the consuming dependency removes it.

The safe direction is to obtain an upstream-compatible fix or update/remove the affected configuration/test consumers together, then repeat clean installs, audit, tooling, native tests and both exports. A numeric audit reduction alone is insufficient.

## API patch phase

The five API moderate entries are removed by consumer-scoped glob 14.0.2 (Swagger) and minimatch 11.0.1 (archive traversal) overrides. Clean npm 10.9.9 installation succeeds; the installed full API graph reports **zero findings**. Two direct consumer checks parse real annotated nested source and create/read an archive with exclusion patterns. TypeScript, source-free bootstrap and 177 related API regressions pass. CI now enforces the moderate audit gate and runs the consumer checks.

See the [API phase receipt](evidence/lms-005-api-validation.json). The full Windows/Linux LMS-003 runs preceded this dependency patch; final exact-candidate full validation remains LMS-060.

See [mobile phase receipt](evidence/lms-005-mobile-validation.json). The original audit packet is retained unchanged.
