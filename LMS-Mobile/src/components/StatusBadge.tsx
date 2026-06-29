import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SubmissionStatus } from '@/types/api';

const styles: Record<SubmissionStatus, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-900', icon: 'time-outline' },
  approved: { bg: 'bg-emerald-100', text: 'text-emerald-900', icon: 'checkmark-circle-outline' },
  rejected: { bg: 'bg-red-100', text: 'text-red-900', icon: 'close-circle-outline' },
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const s = styles[status];
  return (
    <View className={`flex-row items-center self-start rounded-full px-2.5 py-1 ${s.bg}`}>
      <Ionicons name={s.icon} size={12} color="#374151" />
      <Text className={`ml-1 text-xs font-semibold capitalize ${s.text}`}>{status}</Text>
    </View>
  );
}
