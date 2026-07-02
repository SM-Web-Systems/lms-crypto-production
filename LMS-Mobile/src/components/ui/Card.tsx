import React from 'react';
import { View, Text, ViewProps } from 'react-native';
import { cn } from '../../lib/cn';

interface CardProps extends ViewProps {
  children: React.ReactNode;
}

export function Card({ children, className, ...rest }: CardProps) {
  return (
    <View
      className={cn(
        'rounded-2xl bg-white border border-neutral-200 p-4',
        className as string
      )}
      style={{
        shadowColor: '#0f1a1f',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
      {...rest}>
      {children}
    </View>
  );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Text className={cn('text-base font-bold text-primary-dark', className)}>{children}</Text>;
}
