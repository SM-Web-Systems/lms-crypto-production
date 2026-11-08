# Mobile acceptance follow-up — 2026-10-24

This laptop work uses synthetic fixtures and native mocks. **Physical Android and iOS acceptance are NOT RUN.** No EAS build, store submission, deployment, real login/provider/email/payment operation or server access is included. Server owners evaluate and merge the PRs separately.

The existing `docs/deliverable-1/batch-1-device-verification.md` remains historical evidence. Its old branch, test counts, internal-account login and Expo Go instructions are not current release instructions. Use the current approved app/API/Wallet SHAs and the steps here. Wallet remains the account authority; adding another LMS registration/password is not part of acceptance.

## What the laptop verifies

`npm ci` followed by `npm run acceptance:local` in `LMS-Mobile` runs offline evidence-schema regressions, the complete mocked Jest suite and TypeScript. No native binary is built. The path-scoped `Mobile local acceptance` workflow runs the same command on PRs and main; it has read-only repository permissions and no deploy/EAS/provider step.

The added session regression delays an old logout's token lookup until a newer login completes. Native storage may return either the old or newly cached token; superseded logout work must neither clear the newer identity nor revoke that newer token. Normal logout still clears and best-effort revokes its captured token. A superseded logout cannot prove revocation of the previous server session, just as an offline revocation cannot; explicit account/session controls remain available. Cold-callback screen tests establish that unsolicited URL credentials cannot create a session, and that routing waits for an active proof-bound attempt to finish. Existing tests cover PKCE/state, ambiguous callbacks, cancellation, verified-email recovery, role handoffs, lesson content/progress, session restoration and account controls. Exact red/green and final counts are appended after execution.

`LMS-Mobile/AGENTS.md` requires reading [Expo SDK 56 documentation](https://docs.expo.dev/versions/v56.0.0/); that was done before changes. The installed application is still Expo 54 / React Native 0.81.5 / React 19.1. No SDK migration is included. An installed development/preview binary with the `lmsmobile` scheme is required for custom-scheme auth acceptance; Expo Go cannot certify that flow. [Expo authentication guidance](https://docs.expo.dev/guides/authentication/) describes this development-build requirement.

Read-only tooling inventory on this laptop found no `adb`, `emulator`, `xcodebuild` or `java` on PATH, and no standard `%LOCALAPPDATA%/Android/Sdk`, `platform-tools/adb.exe` or `emulator/emulator.exe`. No ADB server or device session was started. This is a tooling inventory, not proof that the owner has no physical device. Windows cannot perform an Xcode/iOS native build here.

## Installed-device prerequisites — separate owner work

Use owner-approved synthetic accounts on an authorized staging environment and an already reviewed installed binary. Record its exact app Git SHA, build identifier and artifact SHA256, the API and Wallet SHAs, device/model/OS, tester and UTC test time. Changing a checkout does not update an installed binary. Read public API/Wallet/web URLs from the built profile; `localhost` on a physical phone refers to the phone. The existing `preview-local-api` profile contains a fixed private LAN address, so it is not a portable acceptance configuration. Do not use it without owner-reviewed target configuration.

Do not use production credentials or customer accounts. Obtain separate authorization before native builds, installations, staging data mutations, email delivery or provider use. This repository does not perform those actions. Use disposable account/export/deletion/session fixtures; no charge/refund, mint, transfer or credential issuance is needed. Keep passcodes, tokens, emails, phone numbers, recovery codes and customer records out of evidence. Record redacted evidence references, not payloads.

Run every group on **both physical Android and physical iOS**. Emulator/simulator checks may help diagnosis but do not satisfy this physical-device gate.

| Evidence group | Required installed-device observations |
| --- | --- |
| `wallet_sso` | Verified identity returns to the installed app; Wallet captcha and enabled second factor remain enforced; cancel/back creates no session; phone-only/unverified identity reaches Wallet add/verify/resend recovery and can retry after verification. Use mocked/staging delivery under separate authorization. |
| `callback_lifecycle` | Warm callback succeeds only for its initiating attempt; forged/duplicate-state or code, replay, stale callback and unsolicited cold launch cannot sign in; killing the app during the browser step requires a new attempt; browser foregrounding does not restore the previous identity. |
| `session_lifecycle` | Restart restores authoritative access; offline/503/locked-storage startup preserves retryable credentials; foreground applies role revocation/expiry; logout does not resurrect after restart; delayed old logout/login/refresh cannot replace a newer identity. |
| `role_handoffs` | Student, sponsor, instructor/TA, admin and other supported workspace fixtures use API-effective access; multi-role account retains appropriate study/web options; no permission comes from legacy role text; web handoff contains no bearer token; pending deletion lands on account controls. |
| `learning_content` | Ordered weeks and all supported text, image, PDF/document, audio, video/YouTube, quiz and assignment paths render and navigate correctly; denied items remain denied; no content-type fallback loses required work. |
| `learning_progress` | Resume position survives leaving/reopening/foregrounding; background flush and failed writes retain a visible retry; completion appears only after acknowledgement; retry/restart cannot turn an incomplete lesson into completed or duplicate a submission. |
| `account_controls` | Independent section failures do not hide other controls; current/other-session revocation behaves correctly; export remains pending until ready; deletion requires exact confirmation and pending cancellation restores authoritative access, using disposable staging accounts only. |
| `documents_accessibility` | Owned/denied/empty credential cases, download/share permission denial and retry, browser handoff and OS back navigation, keyboard/safe-area layouts, large text and TalkBack/VoiceOver announcements work without exposing sensitive URL data. |

For the integrated release, also test `push_notifications` and `offline_learning` on each device. Use the device procedures for provider delivery and installed-app navigation, and for encrypted packages, durable sync and failure recovery. [Push acceptance](LMS-050-PUSH-NOTIFICATIONS.md) · [Offline learning acceptance](LMS-051-OFFLINE-LEARNING.md)

## Evidence completeness command

Copy `LMS-Mobile/acceptance/device-report.template.json` to a private acceptance record outside source, retaining every `not_run` until actually observed. Fill build, target and device metadata and one redacted evidence reference per group.

An independent reviewer checks the signed artifacts and deployed revisions, then records the approved full app SHA and SHA-256 of a separate private build manifest. The manifest contains `version` (1), `environment` (`authorized_staging`), `app_sha`, `api_sha`, `wallet_sha` and a `builds` array. Include one object per platform with `platform` (`android` or `ios`), `app_build_id` and `artifact_sha256`. Use lowercase full commit SHAs and lowercase artifact digests. Record the manifest digest separately from the device report and preserve the exact manifest bytes.

```text
npm run acceptance:device:verify -- --file <completed-report.json> --expected-sha <approved-full-app-SHA> --expected-builds <approved-builds.json> --expected-builds-sha256 <approved-manifest-SHA256>
```

The command above checks the eight core groups for LMS-041 through LMS-043. For LMS-060, add `--integrated` at the end of the command. This requires authorized staging, pinned builds and all ten groups, including push and offline learning on both platforms, and reports `scope: "integrated"`. The core command accepts a report with the two additional slots pending and reports `scope: "core"`.

The checker reads local JSON and matches both devices' build identifiers and artifact hashes and the deployed API and Wallet revisions against the pinned manifest. It requires both platforms, physical device records, complete metadata and passing cases with evidence references. Successful staging output includes `COMPLETE_ATTESTATION`, `build_pins_verified: true` and `hardware_verified: false`. The reviewer still inspects the physical device evidence and checks the installed builds against the signed artifacts. Synthetic fixtures report `environment: "synthetic"` and `build_pins_verified: false`. The committed template deliberately fails the gate.

Device acceptance remains open until both installed-platform reports and their underlying evidence are independently reviewed. Local green tests, a completed JSON file or a successful API deployment cannot close that gate.

## Executed local evidence

Baseline: main `840d8c7541384114f2c38bd50abe924d8c9c2c1a`; original checkouts and the server's release branches were not changed. Node 22.18.0 was used.

- Clean `npm ci --no-audit` installed 1,274 packages; the lockfile did not change. Deprecation warnings remain.
- The new delayed-logout regression failed against unchanged source: a newer sponsor session became signed out. A focused rerun reproduced that assertion in 2.852 seconds. An initial cold full-file run also had three existing timeout/cascade failures; those are not counted as three new bugs. Warm final full runs passed without changing test timeouts.
- A first local-state-only guard was insufficient: two additional red cases proved a stale logout could still revoke either the old or newly returned cached token. The final generation guard abandons superseded logout before both local clearing and API revocation.
- Evidence-checker tests first failed because the helper did not exist. A later invalid-calendar timestamp regression also failed before canonical UTC validation was added. Final checker: **3 tests passed**, including failure/pending/missing evidence, wrong SHA, missing/duplicate platforms, emulator claims and malformed/future timestamps.
- Final `npm run acceptance:local`: **3 Node checker tests passed**, **158 Jest tests / 17 suites passed** (28.084 seconds), then `tsc --noEmit` passed. There were no skipped Jest cases. The five added native-mock cases are two delayed-logout variants and three cold/pending/established callback-screen cases.
- `EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npx --no-install expo config --type public --json` passed locally and resolved SDK `54.0.0`, scheme `lmsmobile`, and Android/iOS identifiers `com.smwebsystems.lms`. Configuration resolution is not a binary build.
- Running the evidence command against the committed unfilled template returned expected exit **2**, `NOT_ACCEPTED`, `hardware_verified: false`. It did not certify either device.

Independent exact-head review and GitHub CI are recorded in the follow-up PR. No installed-device result or email receipt is implied by these local checks.

## LMS-040 staging preview preflight — 7 November 2026

The internal `preview` profile pins the owner-confirmed LMS API and web origin and the AmmaWallet account origin. The offline EAS check resolved Android and iOS, verified the internal distribution and Android APK profile, and checked the installed app identifiers and `lmsmobile` scheme from Expo config. Six tooling tests passed, including refusal of a mismatched Wallet target, an extra public profile variable, a store distribution and a changed scheme.

The app's Wallet registration and recovery links use the embedded Wallet origin. SSO still uses the Wallet origin configured on the staging API. Verify that API/Wallet pairing under LMS-023. The profile check reads repository configuration. The reviewer must inspect the resolved signed build and recorded artifact before distribution.

Once the compatible staging API and Wallet are accepted and the signing owner has access, use the exact approved source checkout and pinned EAS CLI:

```text
npm run acceptance:tooling
npx --no-install eas build --profile preview --platform android
npx --no-install eas build --profile preview --platform ios
```

Record the EAS project and build identifiers, Android version code and ARM support, iOS build number and registered-device provisioning, artifact SHA-256, app/API/Wallet revisions and callback targets. Keep signing files and account credentials out of the record. No signing, distribution or installation occurred during preflight.

### Existing artifact inventory

On 8 November 2026, the LMS GitHub releases and listed Actions artifacts exposed no signed Android or iOS build assets. The existing local APK matched the earlier emulator receipt by SHA-256 and contains only x86_64 native libraries. That artifact remains emulator evidence. The pinned Expo CLI reported no active login and this shell had no configured EAS project ID, so the project's remote build history remains unverified. [Artifact discovery evidence](evidence/lms-040-mobile-artifact-discovery.json)

Docker Buildx provenance verified the staging Wallet API revision for the image observed on 8 November. Recheck the running image before pinning the device manifest. [Wallet API provenance](evidence/lms-023-staging-wallet-buildx-provenance.json)

Once the owner supplies the project link and read access, list its existing builds before creating a new one. Use the returned build IDs and artifact hashes to identify candidates for the separate physical-device review. [EAS CLI reference](https://docs.expo.dev/eas/cli/)

## Separate dependency follow-up

The following is the baseline inventory at `fdbaa12`. The separate `2026-10-25-mobile-dependency-security.md` report records later dependency changes and superseding counts; it does not close physical-device acceptance.

A fresh read-only mobile `npm audit --json` on 2026-10-24 reports **51 dependency-graph findings: one low, 25 moderate, 23 high and two critical**. This acceptance change does not modify dependency versions or claim a clean audit. Graph findings do not establish exploitability in a native bundle.

The direct Axios resolution is 1.18.1; compatible 1.20.0 is available. Critical `shell-quote` 1.8.4 is reached through `react-devtools-core` with parent range `^1.6.1`, allowing a compatible patched refresh. Expo CLI's tar 7.5.16 uses `^7.5.2`, allowing a compatible refresh to 7.5.22. However EAS CLI 16.32.0 separately pins tar exactly 6.2.1; that critical occurrence needs a separately reviewed CLI/tooling change, rather than forcing tar 7 into a tar 6 API contract. See the registry-linked [shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) and [tar advisory](https://github.com/advisories/GHSA-23hp-3jrh-7fpw).

Handle dependency work in a separate focused branch, inspect the exact lockfile delta and repeat clean-install/local acceptance on the changed graph. Do not run `npm audit fix --force`, follow the registry's unrelated Expo downgrade suggestion, or fold an unverified SDK/Router/NativeWind migration into this session fix. Native build/tool compatibility and any artifact produced with changed tooling remain separate owner acceptance.
