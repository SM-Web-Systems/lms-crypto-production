import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { rewardClaimService } from '@/services/rewardClaimService';
import { stroopsToXlm } from '@/app/(student)/rewards';

/** Server times arrive as ISO (completedAt) or raw SQLite UTC text (released_at); Hermes cannot parse the latter as is. */
const serverMs = (t: string) => Date.parse(t.includes('T') ? t : `${t.replace(' ', 'T')}Z`);

/**
 * After a quiz pass: what it earned, and the way to Rewards. An auto-release reward is released while the server
 * handles the submit, so its released_at sits within seconds of completedAt; one that needs approval is not listed yet.
 */
export function QuizRewardNote({ passed, completedAt }: { passed: boolean; completedAt: string }) {
  const router = useRouter();
  const [earned, setEarned] = useState<number | null>(null);
  useEffect(() => {
    if (!passed) return;
    let cancelled = false;
    rewardClaimService.received().then((rows) => {
      const passed = serverMs(completedAt);
      // Whole-second timestamps, so allow a little slack either side; anything outside is another event's reward.
      const total = rows.filter((r) => r.status === 'released' && r.releasedAt
        && Math.abs(serverMs(r.releasedAt) - passed) <= 5000).reduce((sum, r) => sum + r.amountStroops, 0);
      if (!cancelled) setEarned(total);
    }).catch(() => undefined); // Without the amount the learner still gets the link.
    return () => { cancelled = true; };
  }, [passed, completedAt]);
  if (!passed) return null;
  return (
    <View className="gap-2">
      {earned ? (
        <Text accessibilityRole="alert" className="text-sm text-neutral-800">You earned {stroopsToXlm(earned)}. It stays in your LMS balance until you claim it to your wallet.</Text>
      ) : earned === 0 ? (
        <Text className="text-sm text-neutral-600">Some rewards need your instructor's approval before they appear in Rewards.</Text>
      ) : null}
      <Button label="See my rewards" variant="outline" onPress={() => router.push('/(student)/rewards')} />
    </View>
  );
}
