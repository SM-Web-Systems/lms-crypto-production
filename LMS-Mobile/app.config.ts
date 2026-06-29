import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_NAME = 'SM Web Systems LMS';
const APP_SLUG = 'sm-web-systems-lms';
const ANDROID_PACKAGE = 'com.smwebsystems.lms';

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
    'expo-video',
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
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
