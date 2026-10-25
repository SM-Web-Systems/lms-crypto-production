# Local Android testing on Windows

This environment builds an x86_64 Android debug APK and runs the dedicated `LMS_Local_API_35` emulator. It does not deploy to a server or create a store release. Use a short checkout path outside OneDrive, such as `C:\Users\<user>\dev\lms-mobile-local`, to keep native CMake paths short and build caches out of cloud synchronization.

## Installed laptop tools

The setup validated on 2026-10-25 uses Node 22.18.0, Temurin JDK 17.0.20.1+1, Android command-line tools 19.0, Gradle wrapper 8.14.3, and Windows Hypervisor Platform acceleration. No global Java or Android PATH setting is required. The launcher expects:

- JDK: `%LOCALAPPDATA%\LmsMobile\tools\jdk17\<jdk-directory>\bin\java.exe`
- SDK: `%LOCALAPPDATA%\Android\Sdk` (or an explicit `ANDROID_HOME`)
- Gradle cache: `%LOCALAPPDATA%\LmsMobile\gradle`
- AVD: `%USERPROFILE%\.android\avd\LMS_Local_API_35.avd`

Install the SDK packages below using Google's SDK Manager with JDK 17. Command-line tools 19.0 are used by the launcher for `avdmanager.bat`:

```text
platform-tools
platforms;android-35
platforms;android-36
build-tools;35.0.0
build-tools;36.0.0
emulator
system-images;android-35;google_apis;x86_64
ndk;27.1.12297006
cmake;3.22.1
```

The tested emulator is 37.2.12 with Google APIs Android 35 x86_64 image revision 9. The image and JDK downloads were verified against their published checksums. Android Studio is optional; this environment uses the command-line tools. Run `npm run android:local -- doctor` to check Java, ADB and acceleration. Enablement of missing Windows virtualization features may need an administrator and reboot; the launcher does not change those settings.

## Choose test services

Run these commands from `LMS-Mobile`. All three public endpoints must be explicit. For local services:

```powershell
npm run android:local -- configure --api http://localhost:3001/api/v1 --web http://localhost:5173 --wallet http://localhost:5174
```

For an independently provisioned staging LMS and Wallet, replace those values with their actual HTTPS URLs. `configure` writes ignored `.env.local` and `.local-development/targets.json`. Remote endpoints must exactly match that local configuration; the known production LMS and Wallet hosts are refused even when explicitly supplied. These guards apply to `android:local`; ordinary Expo/EAS commands retain their existing behavior and release profiles.

No staging environment was available during the initial Android setup. Local LMS and Wallet services are now prepared; see [the local services guide](../docs/release/LOCAL_MOBILE_SERVICES.md) for their startup commands and synthetic accounts. The loopback values require that runner to be started. Native build and unauthenticated launch checks do not establish that account creation, SSO or learning writes work. The LMS API server must itself point to the same test Wallet, and both web services must be reachable from Android's authentication browser. Public mobile variables must contain no API key or SSO state secret.

The app's existing native return is `lmsmobile://sso-callback`, with a one-use LMS code and PKCE exchange. Adding a localhost Wallet OAuth callback is not part of this setup. Confirm the actual test server SSO configuration before account testing.

## Build and run

Install the locked dependencies with the repository's supported npm 10 version, then generate Android once. Generated native files remain ignored.

```powershell
npx --yes npm@10.9.9 ci
npx expo prebuild --platform android --no-install
npm run android:local -- doctor
npm run android:local -- build
npm run android:local -- emulator
```

Prebuild can rewrite the generic `android` and `ios` npm scripts. Review those automatic changes before committing; this setup uses the separate `android:local` command. Allow the first emulator boot to complete. The launcher uses port 5554, software graphics and a cold boot. The first native build downloads Gradle/Maven packages and compiles native dependencies; it takes substantially longer than later builds.

Keep Metro running in one terminal:

```powershell
npm run android:local -- start
```

In another terminal, install and open the APK:

```powershell
npm run android:local -- install
```

Choose the localhost development server in the development-client launcher. The installer verifies both `emulator-5554` and AVD name `LMS_Local_API_35` before APK installation, port forwarding or app launch. It refuses physical devices and unrelated emulators. It forwards laptop ports 3001, 3002, 5173, 5174 and 8081. If your local services use different ports, update the forwarding deliberately. Stop Metro with Ctrl+C and close the emulator window when finished. If Metro was started through Codex, its terminal/session owns that process.

The generated APK is `android/app/build/outputs/apk/debug/app-debug.apk`. It uses a debug key and x86_64 native libraries, so it is intended for this emulator; it is not the APK for a typical ARM physical phone. Do not distribute it as a release. Restart Metro after changing endpoints. Rebuild after adding or changing native dependencies.

## Verification and limits

```powershell
npm run test:local-setup
npm run acceptance:local
npm run acceptance:tooling
```

The endpoint/device guard tests run in mobile CI. Generated Android sources, environment configuration, logs, APKs and caches remain local. Expo 54.0.35, Expo Router 6.0.24, NativeWind 4.2.6, React 19.1.0 and React Native 0.81.5 are unchanged; the added native dependency is SDK-compatible `expo-dev-client` 6.0.21.

Windows supports these local Android builds. Local iOS builds and the iOS simulator require macOS/Xcode. Physical-device acceptance remains a separate task, using the existing device acceptance checklist and evidence verifier; emulator launch is not physical-device evidence.

References: [React Native environment setup](https://reactnative.dev/docs/0.81/set-up-your-environment), [Android SDK Manager](https://developer.android.com/tools/sdkmanager), [emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration), and [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/).
