# SM Web Systems LMS — Mobile

Expo/React Native student app for the LMS platform.

## Workspaces, accounts, and sessions

Native screens are for student learning. The app uses API-provided workspaces and permissions; the legacy role field does not choose access. Sponsor, instructor, TA, employer, parent, teacher, and administrator accounts receive an explicit web handoff. Multi-role accounts can choose native student learning when authorized and open their other workspaces on web.

Set `EXPO_PUBLIC_WEB_BASE_URL` to your web deployment for handoffs. Development defaults are shown in `.env.example`; physical devices need reachable LAN addresses. Release profiles explicitly use the production web origin. Browser sign-in is separate: no mobile token is put into a handoff URL.

Password recovery is available from sign in. Reset email links continue to work on web; learners can also paste the link/token into the app's reset screen, or open `lmsmobile://reset-password?token=...`. No universal-link or push setup is included in this step.

Profile provides **Account and security**, workspace selection, payments/rewards handoffs when permitted, and wallet setup. Certificates also have an actionable wallet handoff. Account management supports current/other session revocation, requesting/downloading personal data exports, and confirmed account deletion with cancellation during the existing grace period. Pending-deletion accounts reopen directly into account management.

Native tokens stay in SecureStore; the web preview uses tab-scoped session storage. Startup network failures preserve credentials and show a reconnect screen. Existing sessions remain available during transient refresh failures. Authenticated 401 responses centrally sign out the matching session, while permission-denied responses do not discard credentials. Revalidation runs on foreground and periodically while active. Push notifications and durable offline content/progress remain roadmap items.

See `../docs/audits/2026-10-22-step5-mobile-account-session-remediation.md` for validation and device checks.

## Development

```bash
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_BASE_URL to your LMS-Server
npm start
```

Test accounts (after server seed): `student@smwebsystems.com` / `student123`

## Learning content

The course reader preserves authored weeks and supports video, links, PDF, text resources, audio, inline quizzes, lesson-linked assignments, and downloads. Unknown lesson types display an explicit fallback. Android PDF files download with authentication and open through the native share sheet; iOS also supports an authenticated inline preview.

Lesson progress uses the same API records as the web app. Direct video, audio, and embedded YouTube report playback position and completion; external resources can be marked complete explicitly. Quizzes complete after passing, and assignments complete after instructor approval. Failed progress writes remain available for retry while the course reader is mounted. Saved positions reload from the API; the retry queue is not durable offline storage.

The app remains on Expo SDK 54. Audio playback adds SDK-compatible `expo-audio` and `expo-asset` dependencies and requires a new native app build. Recording permissions are disabled for the audio feature.

Local validation:

```bash
npm ci
npm test -- --runInBand
npx tsc --noEmit
npx expo export --platform android --platform ios --max-workers 2 --output-dir dist/validation
```

Device acceptance checks are listed in `../docs/audits/2026-10-22-step4-native-learning-remediation.md`.

## Android release (APK / Google Play)

See **[ANDROID_RELEASE.md](./ANDROID_RELEASE.md)** for EAS Build setup, APK testing builds, and Play Store AAB submission.

Quick start:

```bash
npm run eas -- login
npm run eas -- init
npm run build:android:preview      # APK for device testing
npm run build:android:production   # AAB for Google Play
```

**Package name:** `com.smwebsystems.lms`
