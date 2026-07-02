import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { brand } from '@/theme/colors';

export function LoadingView({ message = 'Loading…' }: { message?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-neutral-50 px-6">
      <ActivityIndicator size="large" color={brand.accent.teal} />
      <Text className="mt-3 text-sm text-neutral-500">{message}</Text>
    </View>
  );
}
