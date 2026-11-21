import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { rewardClaimService } from '@/services/rewardClaimService';
import { stroopsToXlm } from '@/app/(student)/rewards';

/** After a quiz pass: what it earned, and the way to Rewards. The server releases rewards before it answers the submit. */
export function QuizRewardNote({ passed, completedAt }: { passed: boolean; completedAt: string }) {
  const router = useRouter();
  const [earned, setEarned] = useState(0);
  useEffect(() => {
    if (!passed) return;
    let cancelled = false;
    rewardClaimService.received().then((rows) => {
      // Both timestamps are the server's own datetime('now') text, so they compare as strings.
      const total = rows.filter((r) => r.status === 'released' && r.createdAt >= completedAt).reduce((sum, r) => sum + r.amountStroops, 0);
      if (!cancelled) setEarned(total);
    }).catch(() => undefined); // Without the amount the learner still gets the link.
    return () => { cancelled = true; };
  }, [passed, completedAt]);
  if (!passed) return null;
  return (
    <View className="gap-2">
      {earned > 0 ? (
        <Text accessibilityRole="alert" className="text-sm text-neutral-800">You earned {stroopsToXlm(earned)}. It stays in your LMS balance until you claim it to your wallet.</Text>
      ) : null}
      <Button label="See my rewards" variant="outline" onPress={() => router.push('/(student)/rewards')} />
    </View>
  );
}
