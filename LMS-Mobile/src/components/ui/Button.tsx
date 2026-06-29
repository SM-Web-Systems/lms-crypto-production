import React from 'react';
import { Pressable, Text, ActivityIndicator, View, PressableProps } from 'react-native';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
}

const containerByVariant: Record<Variant, string> = {
  primary: 'bg-accent-teal active:bg-accent-teal-hover',
  secondary: 'bg-primary-dark active:bg-primary-900',
  outline: 'bg-transparent border border-neutral-300 active:bg-neutral-100',
  ghost: 'bg-transparent active:bg-neutral-100',
};

const textByVariant: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  outline: 'text-neutral-800',
  ghost: 'text-accent-teal',
};

const sizeContainer: Record<Size, string> = {
  sm: 'px-3 py-2 rounded-lg',
  md: 'px-4 py-3 rounded-xl',
  lg: 'px-6 py-4 rounded-2xl',
};

const sizeText: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = true,
  leftIcon,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center',
        sizeContainer[size],
        containerByVariant[variant],
        fullWidth && 'w-full',
        isDisabled && 'opacity-50',
        className as string
      )}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? '#3d7a8c' : '#ffffff'} />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {leftIcon}
          <Text className={cn('font-semibold', sizeText[size], textByVariant[variant])}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
