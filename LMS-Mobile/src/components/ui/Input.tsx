import React from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';
import { cn } from '../../lib/cn';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...rest }: InputProps) {
  return (
    <View className="w-full gap-1.5">
      {label ? <Text className="text-sm font-medium text-neutral-700">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#9ba8ae"
        className={cn(
          'w-full rounded-xl border bg-white px-4 py-3 text-base text-neutral-900',
          error ? 'border-red-400' : 'border-neutral-300',
          className as string
        )}
        {...rest}
      />
      {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}
