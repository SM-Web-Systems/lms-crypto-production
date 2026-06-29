# SM Web Systems LMS — Mobile

Expo/React Native student app for the LMS platform.

## Development

```bash
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_BASE_URL to your LMS-Server
npm start
```

Test accounts (after server seed): `student@smwebsystems.com` / `student123`

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
