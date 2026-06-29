# Android release (Google Play)

Prepare and build the SM Web Systems LMS Android app with [EAS Build](https://docs.expo.dev/build/introduction/).

## Prerequisites

1. [Expo account](https://expo.dev/signup) (free tier works for builds)
2. [EAS CLI](https://docs.expo.dev/build/setup/) — included as `npm run eas`
3. A **public HTTPS** LMS API URL (production builds embed `EXPO_PUBLIC_API_BASE_URL` at build time)
4. For Play Store upload: [Google Play Console](https://play.google.com/console) developer account ($25 one-time)

## One-time setup

```bash
cd LMS-Mobile
npm install
npm run eas -- login
npm run eas -- init
```

`eas init` links the app to Expo and writes `EAS_PROJECT_ID` into your Expo project config.

Update the production API URL in `eas.json` (`preview` and `production` profiles) if your backend is not at `https://lms.smwebsystems.com/api/v1`.

## Build profiles

| Profile | Output | Use case |
|---------|--------|----------|
| `preview` | **APK** | Install on devices, QA, sideload testing |
| `preview-local-api` | **APK** | APK pointed at a LAN dev server (edit IP in `eas.json`) |
| `production` | **AAB** | Google Play Store (required for new listings) |
| `development` | APK + dev client | Native debugging |

## Build an APK (testing)

```bash
npm run build:android:preview
```

When the cloud build finishes, download the APK from the Expo dashboard or the CLI link and install on Android:

```bash
adb install path/to/app.apk
```

## Build for Google Play (AAB)

```bash
npm run build:android:production
```

Google Play requires an **Android App Bundle (`.aab`)**, not an APK, for store uploads. Use the `production` profile.

Optional local build (requires Android SDK on your machine):

```bash
npm run build:android:production -- --local
```

## Submit to Play Store

1. Create an app in Google Play Console with package name **`com.smwebsystems.lms`** (must match `app.config.ts`).
2. Complete store listing: title, description, screenshots, privacy policy URL.
3. Create a [Google Play service account](https://docs.expo.dev/submit/android/#creating-a-google-service-account) and save the JSON key as `google-play-service-account.json` (gitignored).
4. Update `eas.json` → `submit.production.android.serviceAccountKeyPath` if needed.
5. Run:

```bash
npm run submit:android
```

## App identity

| Field | Value |
|-------|-------|
| Display name | SM Web Systems LMS |
| Android package | `com.smwebsystems.lms` |
| iOS bundle ID | `com.smwebsystems.lms` |
| Version | `1.0.0` (Play `versionCode` auto-increments on production builds) |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_BASE_URL` | LMS API base URL (no trailing slash) |
| `EAS_PROJECT_ID` | Set automatically by `eas init` |

Local dev: copy `.env.example` → `.env` and use your LAN IP for physical devices.

Production: set URLs in `eas.json` build profiles or Expo secrets:

```bash
eas secret:create --name EXPO_PUBLIC_API_BASE_URL --value https://your-api.example.com/api/v1 --scope project
```

## Play Store checklist

- [ ] Production API live on HTTPS
- [ ] App icons and splash (under `assets/images/`)
- [ ] Privacy policy URL (required)
- [ ] Data safety form (account data, files uploaded, messages)
- [ ] At least 2 phone screenshots
- [ ] Content rating questionnaire
- [ ] Internal testing track upload before production rollout

## Troubleshooting

**Build fails on missing `projectId`:** Run `eas init` in `LMS-Mobile`.

**App cannot reach API on device:** Release builds use the URL from `eas.json`, not `.env`. Rebuild after changing it.

**Cleartext HTTP:** Only use HTTP in `preview-local-api` for dev. Play Store builds must use HTTPS.
