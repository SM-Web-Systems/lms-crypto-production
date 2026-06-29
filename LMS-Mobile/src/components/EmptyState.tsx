import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '@/theme/colors';

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) {
  return (
    <View className="items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12">
      <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
        <Ionicons name={icon} size={28} color={brand.accent.teal} />
      </View>
      <Text className="text-base font-semibold text-neutral-800">{title}</Text>
      {message ? <Text className="mt-2 text-center text-sm text-neutral-500">{message}</Text> : null}
    </View>
  );
}
