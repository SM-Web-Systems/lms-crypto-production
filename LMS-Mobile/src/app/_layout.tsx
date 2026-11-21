import '@/global.css';
import 'react-native-url-polyfill/auto';

import { useEffect, useRef } from 'react';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SessionBoundary } from '@/components/SessionBoundary';
import { PushNotificationsBridge } from '@/components/PushNotifications';

/**
 * Signing out (or a session ending) on a pushed screen leaves the old tabs under it on the Stack, and signing in
 * again would stack a second copy on top. Start the Stack again whenever the signed-in learner changes.
 */
function ResetStackOnSignOut() {
  const { user } = useAuth();
  const navigation = useNavigationContainerRef();
  const previous = useRef(user?.id);
  useEffect(() => {
    if (previous.current && previous.current !== user?.id && navigation.isReady()) {
      // The container's only route is expo-router's root Stack; start that Stack again at index.
      const root = navigation.getRootState()?.routes[0]?.name;
      if (root) navigation.resetRoot({ index: 0, routes: [{ name: root, state: { index: 0, routes: [{ name: 'index' }] } }] });
    }
    previous.current = user?.id;
  }, [user?.id, navigation]);
  return null;
}

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
          <ResetStackOnSignOut />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}
