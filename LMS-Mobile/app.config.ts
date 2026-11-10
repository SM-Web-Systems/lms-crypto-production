import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_NAME = 'SM Web Systems LMS';
const APP_SLUG = 'sm-web-systems-lms';
const ANDROID_PACKAGE = 'com.smwebsystems.lms';

function resolveEasProjectId(config: ConfigContext['config']): string | undefined {
  const linked = config.extra?.eas?.projectId;
  const environment = process.env.EAS_PROJECT_ID?.trim() || undefined;
  if (linked && environment && linked !== environment) {
    throw new Error('EAS project ID differs from the linked app configuration.');
  }
  return linked ?? environment;
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: APP_SLUG,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'lmsmobile',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  description:
    'SM Web Systems learning app for students — courses, submissions, quizzes, messages, and more.',
  primaryColor: '#1b3a4b',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.smwebsystems.lms',
    buildNumber: '1',
    infoPlist: {
      NSCameraUsageDescription: 'Used to take a profile photo.',
      NSPhotoLibraryUsageDescription: 'Used to choose a profile photo.',
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#1b3a4b',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['INTERNET'],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#1b3a4b',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
        resizeMode: 'contain',
      },
    ],
    'expo-secure-store',
    ['expo-sqlite', { useSQLCipher: true }],
    ['expo-notifications', { defaultChannel: 'lms-updates' }],
    'expo-video',
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow access to your photos to set a profile picture.',
        cameraPermission: 'Allow camera access to take a profile photo.',
      },
    ],
    [
      'expo-document-picker',
      {
        iCloudContainerEnvironment: 'Production',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 24,
          targetSdkVersion: 35,
          compileSdkVersion: 35,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    ...config.extra,
    encryptedOfflineLearning: true,
    androidPushConfigured: !!(process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile),
    eas: {
      ...config.extra?.eas,
      projectId: resolveEasProjectId(config),
    },
  },
});
