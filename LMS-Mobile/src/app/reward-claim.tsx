import { useEffect, useRef, useState } from 'react';
import { Text, View, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { rewardClaimService, type ResumedClaim } from '@/services/rewardClaimService';
import { claimNotice } from '@/app/(student)/rewards';
import { getErrorMessage } from '@/utils/apiError';

const INTERRUPTED = 'Your claim was interrupted. Start again.';

function outcomeText(outcome: ResumedClaim): string {
  switch (outcome.kind) {
    case 'verified': return claimNotice(outcome.payout);
    case 'declined': return 'You declined the claim in AmmaWallet. Your rewards stay in your LMS balance.';
    case 'expired': return 'This claim expired. Start again.';
    default: return INTERRUPTED;
  }
}

// AmmaWallet hands the signed claim back to lmsmobile://reward-claim#... While the app is running the Rewards
// screen reads that answer itself and this route never opens (see +native-intent). It opens on a cold start,
// when Android closed the app during the hand-off: finish the saved claim from the link that reopened the app.
// The fragment is not in router params, so the link is read from Linking.
export default function RewardClaimReturnScreen() {
  const router = useRouter();
  const [result, setResult] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Linking.getInitialURL()
      .then(url => (url ? rewardClaimService.resumeClaim(url).then(outcomeText) : INTERRUPTED))
      .catch(error => getErrorMessage(error, 'Could not finish the claim. Your rewards are still safe in your LMS balance.'))
      .then(setResult);
  }, []);
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center gap-4 p-6">
        {result === null ? <>
          <ActivityIndicator />
          <Text className="text-base text-neutral-700">Finishing your claim…</Text>
        </> : <>
          <Text accessibilityLiveRegion="polite" className="text-center text-base text-neutral-900">{result}</Text>
          <Button label="Go to Rewards" onPress={() => router.replace('/(student)/rewards')} />
        </>}
      </View>
    </Screen>
  );
}
