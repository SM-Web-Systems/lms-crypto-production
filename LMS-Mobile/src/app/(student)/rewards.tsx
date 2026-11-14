import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { rewardClaimService, type ReceivedReward } from '@/services/rewardClaimService';
import { getErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/format';
import { brand } from '@/theme/colors';

export function stroopsToXlm(stroops: number): string {
  const s = BigInt(Math.trunc(stroops));
  const fraction = (s % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${s / 10_000_000n}${fraction ? `.${fraction}` : ''} XLM`;
}

export default function RewardsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [claimable, setClaimable] = useState(0);
  const [rewards, setRewards] = useState<ReceivedReward[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [balance, list] = await Promise.all([rewardClaimService.claimable().catch(() => 0), rewardClaimService.received()]);
      setClaimable(balance);
      setRewards(list);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load your rewards.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const claim = async () => {
    setClaiming(true); setError(null); setNotice(null);
    try {
      const outcome = await rewardClaimService.claim(claimable);
      if (outcome.kind === 'declined') setNotice('You declined the claim in AmmaWallet. Your rewards stay in your LMS balance.');
      else if (outcome.kind === 'cancelled') setNotice('The claim was not finished. Your rewards are still safe in your LMS balance.');
      else setNotice(outcome.payout?.status === 'paid'
        ? 'Your wallet is confirmed and the reward has been sent to it.'
        : 'Your wallet is confirmed. The claimed amount is reserved for payment to that wallet.');
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Could not complete the claim. Your rewards are still safe in your LMS balance.'));
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return <LoadingView />;

  return (
    <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="gap-4 p-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={brand.accent.teal} />}>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {notice ? <Card><Text accessibilityRole="alert" className="text-sm text-neutral-800">{notice}</Text></Card> : null}
      {claimable > 0 ? (
        <Card>
          <View className="flex-row items-center gap-3">
            <Ionicons name="gift-outline" size={22} color={brand.accent.teal} />
            <View className="flex-1">
              <Text className="text-xs text-neutral-500">Ready to claim</Text>
              <Text className="text-lg font-bold text-neutral-900">{stroopsToXlm(claimable)}</Text>
            </View>
          </View>
          <View className="mt-3">
            <Button label={claiming ? 'Opening AmmaWallet…' : 'Claim to my wallet'} onPress={claim} disabled={claiming} />
          </View>
          <Text className="mt-2 text-xs text-neutral-500">AmmaWallet will ask you to approve with your wallet passphrase. This proves the wallet is yours.</Text>
        </Card>
      ) : null}
      {rewards.length === 0 ? (
        <EmptyState icon="gift-outline" title="No rewards yet" message="Rewards you earn appear here." />
      ) : rewards.map((r) => (
        <Card key={r.allocationId}>
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-neutral-900">{r.rewardType === 'custom' ? 'Reward' : r.rewardType.replace(/_/g, ' ')}</Text>
            <Text className="font-bold text-neutral-900">{stroopsToXlm(r.amountStroops)}</Text>
          </View>
          <Text className="mt-1 text-xs text-neutral-500">{r.status === 'released' ? 'Released' : r.status} · {formatDate(r.releasedAt ?? r.createdAt)}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
