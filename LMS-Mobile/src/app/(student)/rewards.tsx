import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { rewardClaimService, type ClaimPayout, type MyRewardClaim, type ReceivedReward } from '@/services/rewardClaimService';
import { getErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/format';
import { brand } from '@/theme/colors';

export function stroopsToXlm(stroops: number): string {
  const s = BigInt(Math.trunc(stroops));
  const fraction = (s % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${s / 10_000_000n}${fraction ? `.${fraction}` : ''} XLM`;
}

/** What really happened to a claim's payout. Only 'paid' says the reward reached the wallet. */
const CLAIM_PAYOUT: Record<MyRewardClaim['payout'], { label: string; color: string; note?: string }> = {
  paid: { label: 'Paid to wallet', color: 'text-green-700' },
  submitted: { label: 'Sending', color: 'text-blue-700', note: 'The payment is on its way. Pull to refresh in a minute.' },
  failed: { label: 'Payment failed', color: 'text-red-700', note: 'The network did not accept the payment. Nothing was sent; try again.' },
  not_sent: { label: 'Not paid yet', color: 'text-amber-700', note: 'Your claim is saved, but the payment has not been sent to your wallet.' },
};

/** The notice after a claim. A refused or unsent payout is never described as sent. */
export function claimNotice(payout: ClaimPayout | null): string {
  if (payout?.status === 'paid') return 'Your wallet is confirmed and the reward has been sent to it.';
  if (payout?.status === 'refused' || payout?.status === 'pending') {
    return `Your wallet is confirmed, but the reward has not been sent to it yet. ${payout.message || 'Your claim is saved.'}`;
  }
  return 'Your wallet is confirmed. The claimed amount is reserved for payment to that wallet.';
}

const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export default function RewardsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [claimable, setClaimable] = useState(0);
  const [maxClaim, setMaxClaim] = useState<number | null>(null);
  const [rewards, setRewards] = useState<ReceivedReward[]>([]);
  const [claims, setClaims] = useState<MyRewardClaim[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [balance, list, myClaims, limit] = await Promise.all([
        rewardClaimService.claimable().catch(() => 0),
        rewardClaimService.received(),
        Promise.resolve().then(() => rewardClaimService.claims()).catch(() => [] as MyRewardClaim[]),
        Promise.resolve().then(() => rewardClaimService.maxClaim()).catch(() => null),
      ]);
      setClaimable(balance);
      setMaxClaim(typeof limit === 'number' && limit > 0 ? limit : null);
      setRewards(list);
      setClaims(Array.isArray(myClaims) ? myClaims : []);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load your rewards.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // A claim above the per-payment limit can never be paid, so claim at most the limit; the rest stays claimable.
  const claimAmount = maxClaim !== null && claimable > maxClaim ? maxClaim : claimable;

  const claim = async () => {
    setClaiming(true); setError(null); setNotice(null);
    try {
      const outcome = await rewardClaimService.claim(claimAmount);
      if (outcome.kind === 'declined') setNotice('You declined the claim in AmmaWallet. Your rewards stay in your LMS balance.');
      else if (outcome.kind === 'cancelled') setNotice('The claim was not finished. Your rewards are still safe in your LMS balance.');
      else setNotice(claimNotice(outcome.payout));
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Could not complete the claim. Your rewards are still safe in your LMS balance.'));
    } finally {
      setClaiming(false);
    }
  };

  const retry = async (claimId: string) => {
    setRetrying(claimId); setError(null); setNotice(null);
    try {
      const paid = await rewardClaimService.retryPayout(claimId);
      if (paid.status === 'paid') setNotice('The reward has been sent to your wallet.');
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'The payment could not be sent. Your claim is saved.'));
    } finally {
      setRetrying(null);
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
            <Button label={claiming ? 'Opening AmmaWallet…' : claimAmount === claimable ? 'Claim to my wallet' : `Claim ${stroopsToXlm(claimAmount)} to my wallet`} onPress={claim} disabled={claiming} />
          </View>
          {claimAmount !== claimable ? (
            <Text className="mt-2 text-xs text-neutral-500">One payment can be at most {stroopsToXlm(claimAmount)}. Claim again for the rest.</Text>
          ) : null}
          <Text className="mt-2 text-xs text-neutral-500">AmmaWallet will ask you to approve with your Amma password. This proves the wallet is yours. You need the device where your wallet was set up, or your recovery phrase to restore your wallet on this one.</Text>
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
          <Text className="mt-1 text-xs text-neutral-500">{r.status === 'released' ? 'Earned' : r.status} · {formatDate(r.releasedAt ?? r.createdAt)}</Text>
        </Card>
      ))}
      {claims.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-neutral-500">Payments to your wallet</Text>
          {claims.map((c) => {
            const p = c.status === 'cancelled'
              ? { label: 'Cancelled', color: 'text-neutral-600', note: 'The payment failed, so this amount went back to your LMS balance.' }
              : CLAIM_PAYOUT[c.payout];
            const canRetry = c.status === 'verified' && (c.payout === 'not_sent' || c.payout === 'failed');
            return (
              <Card key={c.claimId}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-bold text-neutral-900">{stroopsToXlm(c.amountStroops)}</Text>
                  <Text testID="claim-payout-status" className={`text-sm font-semibold ${p.color}`}>{p.label}</Text>
                </View>
                <Text className="mt-1 text-xs text-neutral-500">to {shortAddress(c.destination)}{c.verifiedAt ? ` · ${formatDate(c.verifiedAt)}` : ''}</Text>
                {p.note ? <Text className="mt-1 text-xs text-neutral-600">{p.note}</Text> : null}
                {canRetry ? (
                  <View className="mt-2">
                    <Button label={retrying === c.claimId ? 'Trying…' : 'Try payment again'} onPress={() => retry(c.claimId)} disabled={retrying === c.claimId} />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}
