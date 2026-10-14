import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { credentialService } from '@/services/credentialService';
import { walletService } from '@/services/walletService';
import { getErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/format';
import { brand } from '@/theme/colors';
import type { MyCredential, WalletStatus } from '@/types/credential';

function WalletBanner({ status }: { status: WalletStatus | null }) {
  if (!status) return null;

  const linked = walletService.isWalletLinked(status.walletLinkingStatus);

  return (
    <View
      className={`flex-row items-center rounded-xl border px-4 py-3 ${
        linked
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}>
      <Ionicons
        name={linked ? 'wallet-outline' : 'warning-outline'}
        size={20}
        color={linked ? '#065f46' : '#92400e'}
      />
      <View className="ml-3 flex-1">
        <Text
          className={`text-sm font-semibold ${
            linked ? 'text-emerald-900' : 'text-amber-900'
          }`}>
          {linked ? 'Wallet linked' : 'Wallet not linked'}
        </Text>
        {linked && status.walletAddress ? (
          <Text className="mt-0.5 text-xs text-emerald-700" numberOfLines={1}>
            {status.walletAddress.slice(0, 8)}…{status.walletAddress.slice(-6)}
          </Text>
        ) : (
          <Text className="mt-0.5 text-xs text-amber-700">
            Link your wallet on the web dashboard to receive certificates.
          </Text>
        )}
      </View>
    </View>
  );
}

function CertificateCard({
  credential,
  onPress,
}: {
  credential: MyCredential;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Card className="active:opacity-90">
        <View className="flex-row items-start gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary-50">
            <Ionicons name="ribbon-outline" size={24} color={brand.accent.teal} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-neutral-900" numberOfLines={2}>
              {credential.courseTitle ?? 'Certificate'}
            </Text>
            {credential.courseCode ? (
              <Text className="mt-0.5 text-xs text-neutral-500">{credential.courseCode}</Text>
            ) : null}
            <View className="mt-2 flex-row items-center gap-3">
              <View className="flex-row items-center gap-1">
                <Ionicons name="calendar-outline" size={12} color={brand.neutral[400]} />
                <Text className="text-xs text-neutral-400">{formatDate(credential.issuedAt)}</Text>
              </View>
              {credential.network ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="globe-outline" size={12} color={brand.neutral[400]} />
                  <Text className="text-xs capitalize text-neutral-400">{credential.network}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={brand.neutral[400]} />
        </View>
      </Card>
    </Pressable>
  );
}

export default function CertificatesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<MyCredential[]>([]);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [creds, wallet] = await Promise.all([
        credentialService.fetchMyCredentials(),
        walletService.fetchWalletStatus().catch(() => null),
      ]);
      setCredentials(creds);
      setWalletStatus(wallet);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load your certificates.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (loading && !refreshing) return <LoadingView message="Loading certificates…" />;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerClassName="p-4 gap-4 pb-8"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={brand.accent.teal}
        />
      }>
      <WalletBanner status={walletStatus} />

      {error ? <ErrorBanner message={error} onRetry={loadData} /> : null}

      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-neutral-900">
          My Certificates
        </Text>
        <Text className="text-sm text-neutral-500">
          {credentials.length} {credentials.length === 1 ? 'certificate' : 'certificates'}
        </Text>
      </View>

      {credentials.length === 0 ? (
        <EmptyState
          icon="ribbon-outline"
          title="No certificates yet"
          message="Complete courses and quizzes to earn NFT certificates."
        />
      ) : (
        <View className="gap-3">
          {credentials.map((cred) => (
            <CertificateCard
              key={cred.credentialId}
              credential={cred}
              onPress={() =>
                router.push({
                  pathname: '/(student)/certificate-detail',
                  params: { id: cred.credentialId },
                })
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
