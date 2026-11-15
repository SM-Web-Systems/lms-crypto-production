import { useEffect } from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';

// AmmaWallet hands the signed claim back to lmsmobile://reward-claim. The Rewards screen is the one that
// reads that answer (through the browser session it started), so this route reads nothing from the URL:
// it only shows a short message and returns to Rewards instead of the "Unmatched Route" page.
export default function RewardClaimReturnScreen() {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.replace('/(student)/rewards'), 400);
    return () => clearTimeout(timer);
  }, [router]);
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center gap-4 p-6">
        <ActivityIndicator />
        <Text className="text-base text-neutral-700">Finishing your claim…</Text>
      </View>
    </Screen>
  );
}
