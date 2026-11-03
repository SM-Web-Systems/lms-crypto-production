import React from 'react';
import { View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { cn } from '../../lib/cn';

interface ScreenProps {
  children: React.ReactNode;
  className?: string;
  edges?: Edge[];
}

/** Brand-background safe-area wrapper used by every screen. */
export function Screen({ children, className, edges = ['top'] }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={{flex:1,backgroundColor:'#f8fafb'}}>
      <View className={cn('flex-1', className)}>{children}</View>
    </SafeAreaView>
  );
}
