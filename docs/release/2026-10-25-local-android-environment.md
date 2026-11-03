# Local Android environment validation — 2026-10-25

Branch: `codex/mobile-local-environment`, based on mobile dependency remediation PR #94 at `6a189d75f75f05c4e4a93e1acf7af51ae35cda88`. This is laptop development work. Server evaluation, merges and deployment remain with the server operator.

## Environment and change

A separate short Windows checkout outside OneDrive is used for native builds. A portable Temurin JDK 17.0.20.1+1 and Android SDK command-line tools 19.0 are installed under the user's local AppData. No global PATH/Java setting, Windows feature, administrator installer or reboot was required. WHPX reports installed and usable. The Gradle wrapper resolves 8.14.3 with a separate local AppData cache.

Installed Android packages: platform-tools 37.0.1; API 35 and 36 platforms; build-tools 35.0.0 and 36.0.0; emulator 37.2.12; Google APIs Android 35 x86_64 image revision 9; NDK 27.1.12297006; CMake 3.22.1. The initial large system-image download reset its connection; the completed resumed official archive was SHA1 verified as `0103e6dab21290c4b9d16550a3ce99476f884eef`, extracted locally and registered successfully by SDK Manager. The Temurin archive SHA256 was `e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0`.

Added Expo-compatible `expo-dev-client` 6.0.21 and six supporting native packages. No existing dependency versions changed. Expo 54.0.35, Router 6.0.24, NativeWind 4.2.6, React 19.1.0 and React Native 0.81.5 remain unchanged. Generic Android/iOS scripts retain their original behavior. The separate `android:local` helper configures targets, checks tools, builds, starts the dedicated emulator, starts Metro and installs the debug APK. Metro and native builds are capped at two workers for subsequent launches.

The helper requires all three explicit public service URLs and blocks the known production LMS/Wallet hosts. Remote targets require exact configured HTTPS URLs. It checks both `emulator-5554` and `LMS_Local_API_35` before forwarding ports, installing the APK or launching it; unrelated and physical devices are refused. Actual Windows ADB returned CRCRLF output; the identity parser was corrected to accept that line ending while retaining exact name matching, with regression coverage. Setup commands and limitations are in `LMS-Mobile/LOCAL_ANDROID.md`.

## Executed validation

- Native Gradle `app:assembleDebug`, x86_64: **PASS**, 452 tasks, first build 34m41s. Gradle deprecation and CMake path-length warnings were emitted; compilation and packaging completed successfully. Generated Android sources and APK remain ignored.
- APK: `LMS-Mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 79,439,612 bytes, SHA256 `a24f0c61fe1c635f9a85302381135dcb66011bf996c8e43a202fa10471cd379c`.
- Dedicated Google APIs Android 15 emulator: **BOOTED** with Windows Hypervisor Platform acceleration. First boot approximately 134 seconds. Debug APK installation returned **Success** and the app's native activity opened.
- Local Metro bundle: **PASS**, 1,727 modules. The unauthenticated screen rendered with AmmaWallet sign-in, recovery/registration and the existing administrator/internal sign-in option. No login, registration or provider mutation was attempted. The development menu was dismissed to inspect the app. No AndroidRuntime/ReactNativeJS error was emitted in the launch log probe. This is an emulator smoke test only.
- Local target/device guard tests: **5 PASS**, including production rejection, exact staging targets, newline injection rejection and CRCRLF AVD identity output. Added to mobile CI.
- Existing mobile acceptance: **158 Jest tests / 17 suites PASS**, **3 device-report checker tests PASS**, **TypeScript PASS**. An initial cold run overlapping the native build timed out in session restoration and had two dependent failures; the full rerun passed with unchanged assertions/deadlines and no skips.
- Offline tooling: **5 tests PASS** plus actual pinned EAS CLI/schema probe (8 build platform profiles, 1 Android submit profile, unchanged configuration). No EAS cloud build, login or submission.
- npm 10.9.9 lockfile clean-install dry run: **PASS**. Full audit unchanged: **20 entries: 8 high, 11 moderate, 1 low, 0 critical**. This setup does not remediate the previously documented framework-major advisory backlog.

## Remaining acceptance

No staging environment currently exists. Ignored local configuration contains localhost placeholders for LMS API, LMS web and Wallet web; those services were not started. Authenticated SSO, account management and learning writes remain **NOT RUN** until an actual isolated LMS/Wallet pair is provisioned and configured consistently. The existing native callback is `lmsmobile://sso-callback`; no production OAuth callback allowlist was changed. Native/Metro app startup does not prove backend acceptance.

Physical Android acceptance and all iOS device acceptance remain **NOT RUN**. This x86_64 debug APK is for the dedicated emulator, not ARM phone distribution. Windows cannot run a local iOS simulator/build; macOS/Xcode is required. No release signing credentials, cloud build or server deployment were used. The existing physical-device report remains separate and is not marked complete by this evidence.
