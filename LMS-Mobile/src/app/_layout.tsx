import '@/global.css';
import 'react-native-url-polyfill/auto';

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/context/AuthContext';
import { SessionBoundary } from '@/components/SessionBoundary';
import { PushNotificationsBridge } from '@/components/PushNotifications';

export default function RootLayout() {
  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          {/* A Stack, not a Slot: Notification, Account and Workspace push over the tabs and pop back to them,
              so a half-done quiz or draft survives the visit. */}
          <SessionBoundary><Stack screenOptions={{ headerShown: false }} /></SessionBoundary>
          <PushNotificationsBridge />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}
