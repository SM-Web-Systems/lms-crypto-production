import '@/global.css';
import 'react-native-url-polyfill/auto';

import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/context/AuthContext';
import { SessionBoundary } from '@/components/SessionBoundary';

export default function RootLayout() {
  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <SessionBoundary><Slot /></SessionBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}
