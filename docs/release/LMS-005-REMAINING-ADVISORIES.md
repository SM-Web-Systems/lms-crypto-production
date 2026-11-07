# LMS-005 — remaining dependency findings

Status **complete**. Fresh API and mobile audits report zero findings. Both hosted workflows passed at `4010371`, including their low-threshold audit gates. [API and browser CI](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42346118148) · [Mobile CI](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42346118130)

## Mobile patch phase — 6 November 2026

The clean installed graph has **0 critical, 0 high, 0 moderate and 23 low** findings. The 23 low entries are one direct `deepmerge` advisory and its dependency chains, not 23 separate root vulnerabilities. The previous graph had 27 moderate and 9 low entries.

Consumer-scoped overrides select glob 14.0.2, minimatch 11.0.1, UUID 11.1.1 and diff 8.0.3 while retaining unaffected older APIs where needed. Broad version-range overrides produced stale nested resolutions and a lock that npm ci rejected. They were replaced by explicit consumer overrides, followed by successful clean npm 10.9.9 installation.

EAS CLI's default callable ts-deepmerge API differs from patched 8.0.0's named `merge` export. A small local adapter exports the unmodified upstream function, retained as an auditable npm alias. The regression runs the actual EAS project-config generator offline against a temporary synthetic project and checks nested values and hostile prototype-method input. No EAS account or cloud project is changed.

All seven dependency checks, five offline tooling checks, TypeScript, 159 native assertions and both Android/iOS Metro exports pass. Glob matching/cancellation is checked from actual nested Expo/Sucrase resolution paths, with native Windows path separators. UUID generation uses the actual Xcode consumer. Diff patch round trips and Router/Metro compatibility remain covered. These are local graph checks, not signed-device acceptance.

## Verified replacement — 7 November 2026

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) covers prototype poisoning in upstream deepmerge 4.2.0–4.3.1. The installed mobile graph now resolves all eight consumer paths to pinned `@stackline/deepmerge@1.1.2`. The tarball matches the published release. npm verified its registry signature and provenance attestation. The reviewed CommonJS build filters hostile prototype keys and preserves the callable interface used by the installed consumers. [Published release](https://github.com/alexandroit/stackline-deepmerge/releases/tag/v1.1.2)

An empty npm 10.9.9 install succeeded. Fresh API and mobile audits at the low threshold report zero findings. The eight dependency tests cover actual Expo and EAS config consumers and Jest presets, including ordinary array and nested-object merge behavior and the hostile input. Five offline tooling checks, 182 Jest assertions, TypeScript and Android/iOS Hermes exports passed. Both CI audit thresholds now fail on low advisories.

See the [replacement validation receipt](evidence/lms-005-deepmerge-validation.json). Signed-device and final release acceptance remain separate.

## API patch phase

The five API moderate entries are removed by consumer-scoped glob 14.0.2 (Swagger) and minimatch 11.0.1 (archive traversal) overrides. Clean npm 10.9.9 installation succeeds; the installed full API graph reports **zero findings**. Two direct consumer checks parse real annotated nested source and create/read an archive with exclusion patterns. TypeScript, source-free bootstrap and 177 related API regressions pass. CI now enforces the moderate audit gate and runs the consumer checks.

See the [API phase receipt](evidence/lms-005-api-validation.json). The full Windows/Linux LMS-003 runs preceded this dependency patch; final exact-candidate full validation remains LMS-060.

See [mobile phase receipt](evidence/lms-005-mobile-validation.json). The original audit packet is retained unchanged.
