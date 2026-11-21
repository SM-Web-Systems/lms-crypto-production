import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { backOr } from '@/utils/navigation';
import * as Linking from 'expo-linking';
import { deleteAsync, documentDirectory, downloadAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { credentialService } from '@/services/credentialService';
import { ApiRequestError, getErrorMessage } from '@/utils/apiError';
import { formatDate } from '@/utils/format';
import { brand } from '@/theme/colors';
import type { MyCredential } from '@/types/credential';
import * as Clipboard from 'expo-clipboard';

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <View className="flex-row items-start gap-3 py-2">
      <Ionicons name={icon} size={18} color={brand.neutral[400]} />
      <View className="flex-1">
        <Text className="text-xs text-neutral-500">{label}</Text>
        <Text className="mt-0.5 text-sm font-medium text-neutral-900">{value}</Text>
      </View>
    </View>
  );
}

export default function CertificateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<MyCredential | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadCredential = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const creds = await credentialService.fetchMyCredentials();
      const found = creds.find((c) => c.credentialId === id) ?? null;
      if (!found) {
        setError('Certificate not found.');
      }
      setCredential(found);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load certificate details.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCredential();
  }, [loadCredential]);

  const handleViewOnStellar = useCallback(() => {
    if (!credential) return;
    const url = credentialService.getStellarExplorerUrl(
      credential.txHash,
      credential.network
    );
    if (url) {
      Linking.openURL(url);
    } else {
      Alert.alert('Not available', 'No blockchain transaction recorded for this certificate.');
    }
  }, [credential]);

  const handleCopyVerificationUrl = useCallback(async () => {
    if (!credential) return;
    const url = credentialService.getVerificationUrl(credential.credentialId);
    await Clipboard.setStringAsync(url);
    Alert.alert('Copied', 'Verification link copied to clipboard.');
  }, [credential]);

  const handleDownloadPdf = useCallback(async () => {
    if (!credential) return;
    setDownloading(true);
    try {
      const url = credentialService.getPdfUrl(credential.credentialId);
      const filename = `certificate-${credential.credentialId}.pdf`;
      const fileUri = `${documentDirectory}${filename}`;

      // A 404 or 500 body would otherwise be saved and shared as the learner's certificate.
      const result = await downloadAsync(url, fileUri);
      if (result.status !== 200) {
        await deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
        throw new ApiRequestError({ message: 'Could not download the certificate PDF.', status: result.status });
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Certificate PDF',
        });
      } else {
        Alert.alert('Sharing unavailable', 'This device cannot open the share sheet. Download your certificate PDF from the LMS website instead.');
      }
    } catch (e) {
      Alert.alert('Download failed', getErrorMessage(e, 'Could not download the certificate PDF.'));
    } finally {
      setDownloading(false);
    }
  }, [credential]);

  // This screen is a hidden tab, so it stays mounted between visits. Without this check, opening a second
  // certificate showed the previous one at once, with its "View on Stellar" button already under the
  // finger, and the second half of a double tap on the card opened Chrome on the old transaction.
  const showingAnotherCertificate = credential != null && credential.credentialId !== id;
  if (loading || showingAnotherCertificate) return <LoadingView message="Loading certificate…" />;

  if (error || !credential) {
    return (
      <View className="flex-1 bg-neutral-50 p-4">
        <ErrorBanner
          message={error ?? 'Certificate not found.'}
          onRetry={loadCredential}
        />
        <View className="mt-3">
          <Button label="Back to certificates" variant="outline" onPress={() => backOr(router, '/(student)/certificates')} />
        </View>
      </View>
    );
  }

  const explorerUrl = credentialService.getStellarExplorerUrl(
    credential.txHash,
    credential.network
  );

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerClassName="p-4 gap-4 pb-8">
      {/* Header */}
      <Card>
        <View className="items-center py-2">
          <View className="mb-3 h-16 w-16 items-center justify-center rounded-2xl bg-primary-50">
            <Ionicons name="ribbon-outline" size={32} color={brand.accent.teal} />
          </View>
          <Text className="text-center text-xl font-bold text-neutral-900">
            {credential.courseTitle ?? 'Certificate'}
          </Text>
          {credential.courseCode ? (
            <Text className="mt-1 text-sm text-neutral-500">{credential.courseCode}</Text>
          ) : null}
          <Text className="mt-2 text-xs text-neutral-400">
            Issued {formatDate(credential.issuedAt)}
          </Text>
        </View>
      </Card>

      {/* Details */}
      <Card>
        <CardTitle className="mb-2">Certificate Details</CardTitle>
        <DetailRow
          icon="finger-print-outline"
          label="Certificate ID"
          value={credential.credentialId}
        />
        <DetailRow
          icon="wallet-outline"
          label="Wallet Address"
          value={credential.walletAddress}
        />
        <DetailRow
          icon="globe-outline"
          label="Network"
          value={credential.network}
        />
        {credential.txHash ? (
          <DetailRow
            icon="link-outline"
            label="Transaction Hash"
            value={`${credential.txHash.slice(0, 12)}…${credential.txHash.slice(-8)}`}
          />
        ) : null}
        {credential.sorobanTokenId != null ? (
          <DetailRow
            icon="pricetag-outline"
            label="Token ID"
            value={`#${credential.sorobanTokenId}`}
          />
        ) : null}
        {credential.contractId ? (
          <DetailRow
            icon="code-outline"
            label="Contract"
            value={`${credential.contractId.slice(0, 8)}…${credential.contractId.slice(-6)}`}
          />
        ) : null}
        {credential.quizTitle ? (
          <DetailRow
            icon="clipboard-outline"
            label="Quiz"
            value={credential.quizTitle}
          />
        ) : null}
      </Card>

      {/* Actions */}
      <View className="gap-3">
        {explorerUrl ? (
          <Button
            label="View on Stellar"
            variant="primary"
            leftIcon={<Ionicons name="open-outline" size={18} color="#fff" />}
            onPress={handleViewOnStellar}
          />
        ) : null}

        <Button
          label={downloading ? 'Downloading…' : 'Download PDF'}
          variant="outline"
          leftIcon={<Ionicons name="download-outline" size={18} color={brand.neutral[800]} />}
          onPress={handleDownloadPdf}
          loading={downloading}
          disabled={downloading}
        />

        <Button
          label="Copy Verification Link"
          variant="ghost"
          leftIcon={<Ionicons name="copy-outline" size={18} color={brand.accent.teal} />}
          onPress={handleCopyVerificationUrl}
        />
      </View>
    </ScrollView>
  );
}
