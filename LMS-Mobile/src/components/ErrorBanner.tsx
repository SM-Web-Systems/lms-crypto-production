import React from 'react';
import { View, Text } from 'react-native';
import { Button } from '@/components/ui/Button';

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <Text className="text-sm font-medium text-red-900">{message}</Text>
      {onRetry ? (
        <View className="mt-2">
          <Button label="Try again" variant="outline" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
