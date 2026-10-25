# Mobile dependency and CLI security follow-up

Laptop-only follow-up to mobile acceptance commit `fdbaa121acdad08e016375a3aaeb2da42ca63394` (PR #92). PR #92 is still open, so the dependency PR targets `codex/mobile-acceptance-followup`; after its server-managed merge, retarget this PR to `main` and rerun checks. The server owns merges and deployment. No EAS login, cloud API, native build, credential operation, store submission, production account or server operation was performed. Physical Android/iOS acceptance remains **NOT RUN**.

## Scope and audit evidence

| Graph checkpoint | Low | Moderate | High | Critical | Total |
| --- | --- | --- | --- | --- | --- |
| Accepted mobile baseline (`fdbaa12`, 2026-10-24) | 1 | 25 | 23 | 2 | 51 |
| Compatible Axios / shell-quote / tar refresh, retaining EAS 16 | 1 | 25 | 22 | 1 | 49 |
| EAS 25.3.0 plus its scoped tar patch | 1 | 22 | 21 | 0 | 44 |
| Further compatible transitive refreshes | 1 | 21 | 12 | 0 | 34 |
| Final full graph, 2026-10-25 | 1 | 11 | 8 | 0 | 20 |
| Final production-only graph, 2026-10-25 | 0 | 6 | 5 | 0 | 11 |

These are npm dependency-graph findings, not counts of distinct exploitable native-app flaws. Shared upstream findings produce several package entries. Production-only classification does not establish what ships in a native binary: Expo also brings build/configuration tools through production edges. No clean-audit or bundle-reachability clearance is claimed. CI now audits the complete graph at critical severity, retaining npm failures for registry/audit errors. Passing that gate does not approve remaining high/moderate findings. Raw snapshots and comparison files are preserved as private ignored artifacts.

| Package/tool | Baseline | Final resolution |
| --- | --- | --- |
| Axios | 1.18.1 | 1.20.0, direct minimum `^1.20.0` |
| shell-quote | 1.8.4 | 1.12.0 within the parent range |
| Expo CLI tar | 7.5.16 | 7.5.22 within `^7.5.2` |
| EAS CLI | 16.32.0 | Exact 25.3.0 in package.json and eas.json |
| EAS tar | 6.2.1 in EAS 16 | EAS 25 uses tar 7; scoped override of its 7.5.19 pin to 7.5.22 |
| EAS / eas-json Joi | 17.11.0 | Scoped same-family override to 17.13.8 |
| EAS minimatch | 5.1.2 | Version-specific override to 5.1.9; versions 9/10 retained |
| Nano ID | Includes EAS 3.3.8 | 3.3.20 throughout the observed major-3 graph |
| YAML | Includes EAS 2.6.0 | Version-specific 2.6.0 override to 2.9.0 |
| PostCSS | Includes Metro 8.4.49 | 8.5.31 throughout the observed major-8 graph |
| AJV | Includes EAS 8.11.0 | 8.20.0 throughout the observed major-8 graph |
| postcss-selector-parser | 6.1.5 | 7.1.6, reviewed using generated CSS and native styles |
| @react-navigation/core | 7.21.1 | Compatible 7.24.0 through its existing parent range |

Additional compatible refreshes include brace-expansion, browserslist data, compression, fast-uri, follow-redirects, js-yaml, jsep, moment, source-map-js, undici and xmldom. Final lock inventory: **60 existing versions changed, 47 entries added, 45 removed** (1,295 to 1,297 entries, including the root). Many larger-version and platform changes belong to the EAS toolchain transition; this is not a three-package-only patch.

Application framework resolutions are unchanged: **Expo 54.0.35, Router 6.0.24, NativeWind 4.2.6, React 19.1.0 and React Native 0.81.5**. No application source or auth/session behavior is changed. Tar 6 parents are not forced onto tar 7. The minimatch override matches only the vulnerable pinned 5.1.2 request, avoiding a forced downgrade of newer glob dependencies. A broad audit-fix attempt during preparation moved a protected framework resolution and was discarded; final targeted updates and explicit invariants preserve the five versions above. `npm audit fix --force` was not used.

## Compatibility and generated output

EAS 25.3.0 is a [published Expo CLI release](https://github.com/expo/eas-cli/releases/tag/v25.3.0); its engine supports local Node 22.18.0 and CI's Node 22 target. Repository instructions required reading the exact [Expo 56 reference](https://docs.expo.dev/versions/v56.0.0/) before code changes; this was done without upgrading the application's SDK 54. The CLI's nested configuration tooling version is distinct from the app SDK. See [EAS configuration](https://docs.expo.dev/eas/json/) and [build profiles](https://docs.expo.dev/build/eas-json/). Offline validation cannot certify a later cloud build or signed native artifact.

The selector-parser override crosses its parents' requested major. The [maintainer advisory](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf) already lists 6.1.5 as patched, while npm flags that range. Resolving 7.1.6 clears this graph discrepancy; it does not prove several independent app vulnerabilities. PostCSS stays on major 8 even where its override exceeds Metro's minor range. NativeWind and Tailwind 3 remain in place.

Actual src/global.css, Tailwind configuration, NativeWind native preset and source content were compiled with NATIVEWIND_OS=android, then converted by the installed react-native-css-interop/css-to-rn converter with inlineRem 14. Final output matches both the prepared pre-override graph and the accepted PR #92 installation byte-for-byte:

- CSS SHA256: `db8da1606a779c1252330c4cdda7bf92bf42fb30b4bef7d997bd214b8592921f`.
- Native runtime-style JSON SHA256: `f72d2676980934b34071124c5291f5adda61324179c4fa9161e12094d5caf628`.

This verifies this application's generated output, not universal plugin compatibility or physical-device rendering. No Tailwind 4 migration or stylesheet change is included. Browserslist/deprecation warnings remain informational and were not hidden by changing checks.

## Offline tooling checks

The tooling acceptance command runs five Node tests, starts only the installed CLI's version command, and reads its actual eas-json schemas. It verifies installed/configured CLI pins, resolves four build profiles for Android/iOS (**eight resolutions**) and the Android submit profile, and checks package/eas/app configuration bytes remain unchanged. Invalid distributions, wrong CLI pins and empty profile sets fail. The actual EAS metadata AJV wrapper is tested with draft-06 formats, valid/invalid input and readable errors.

The helper loads its guard itself and preloads it in the version child. The guard denies Node HTTP/HTTPS, HTTP/2, socket/TLS, datagram, DNS callback/promise/resolver variants and fetch, synchronizing builtin ESM exports. This guards trusted local probes; it is not an OS sandbox. It never runs eas config, account lookup, initialization, login, build, submit or cloud credential commands. Registry downloads/audits and documentation browsing are separate from these guarded probes.

The original guard's DNS and HTTP/2/datagram gaps failed tests with underlying APIs replaced by local traps, so failures could not send real network traffic. The first run also encountered an unavailable schema module during installation; that setup failure is not a security finding. All five final tooling tests pass. The guard is never loaded into the mobile application.

## Executed local evidence

- Clean npm 10.9.9 installation completed with 1,278 installed packages before final AJV deduplication. Final npm 10 install removed two obsolete nested AJV entries, and the final clean-install dry run passed. Final-graph Linux clean installation is a separate GitHub CI gate recorded on the PR.
- Tooling: **five Node tests passed**, EAS **25.3.0** startup passed, eight build-profile and one Android submit-profile resolutions passed; configuration hashes were unchanged.
- First full acceptance: **155 passes / three failures**. The first session-restoration test exceeded its existing five-second cold-start deadline, followed by two session-state failures. The unchanged isolated file passed **18 tests** in 4.625 seconds. Final complete rerun passed **158 Jest tests / 17 suites** in 15.255 seconds, **three device-report checker tests**, and TypeScript. No deadlines, assertions or skip settings were relaxed.
- Offline public Expo config resolved SDK 54.0.0 and scheme lmsmobile using the application's installed CLI. Configuration resolution is not a binary build.
- Final full/production audit reports: **20 / 11 findings**, **zero critical** in each. The five framework resolutions were checked against fdbaa12 after updates.
- Exact-commit independent review and CI results are recorded on the PR. These checks do not substitute for owner acceptance.

## Remaining work and owner acceptance

| Remaining path | Assessment / next action |
| --- | --- |
| node-forge and dependent Expo/EAS certificate, PKCS12 and JKS paths | High. Final registry lookup reports 1.4.0 as current, and the RSA-verification advisory includes it. Require an upstream fix or separately reviewed replacement; upgrading EAS does not clear this chain. |
| image-size 1.2.1 through Metro | High. Metro requests ^1.0.2; no patched 1.x version was available for the reported parser-loop findings. Coordinate Metro/SDK compatibility or a reviewed adapter instead of forcing a newer API into the old parent. |
| query-string / decode-uri-component through Router | Moderate. The old CommonJS range cannot be replaced blindly by the patched ESM generation. Updating navigation-core removes its affected edge, but retained Router still has one. Address with reviewed Router/framework work. |
| uuid through Xcode, logger and telemetry tools | Moderate. Older major-7/8 branches remain; assess call sites and a supported major migration separately. |
| ts-deepmerge 6.2.0 and diff 7.0.0 pinned by EAS | Moderate / low. Fixes require newer major generations; assess API/behavior compatibility rather than downgrading EAS to npm's old suggested version. |

The full graph still has eight high, eleven moderate and one low entries, including affected parent packages listed by npm. No remaining finding is waived. Build-service behavior, remote version management, native binaries, signing compatibility, Wallet handoff and installed Android/iOS behavior remain unverified here.

Keep device acceptance **NOT RUN** until independently reviewed binaries, artifact digests and underlying evidence exist. The existing checker only reports COMPLETE_ATTESTATION with hardware_verified false; its template remains unfilled and cannot authorize release. See mobile-device-acceptance-followup.md. Before a later separately authorized build, install the exact reviewed CLI and assess its residual signing-tool risks. No cloud build, merge or deployment is authorized by this report.
