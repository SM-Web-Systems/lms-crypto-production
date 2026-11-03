import { useEffect } from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Screen } from '@/components/ui/Screen';

// This route never accepts URL tokens or exchanges codes. Only the active browser
// attempt retains the verifier and may complete sign-in through AuthProvider.
export default function SsoCallbackScreen() {
  const {isAuthenticated,walletSignInPending,sessionNotice} = useAuth();
  const router = useRouter();
  useEffect(() => { if (isAuthenticated && !walletSignInPending) router.replace('/'); },[isAuthenticated,walletSignInPending,router]);
  return <Screen edges={['top','bottom']}><View className="flex-1 justify-center p-6 gap-4">
    <Text className="text-2xl font-bold text-neutral-900">AmmaWallet sign-in</Text>
    {walletSignInPending ? <><ActivityIndicator/><Text>Completing sign-in…</Text></> : <>
      {sessionNotice ? <Text accessibilityRole="alert">{sessionNotice}</Text> : null}
      <Text>Return to sign in to continue. If the app was closed during sign-in, please start again.</Text>
      <Link href="/(auth)/sign-in" className="font-semibold text-accent-teal">Back to sign in</Link>
    </>}
  </View></Screen>;
}
