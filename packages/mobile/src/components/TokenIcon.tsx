// packages/mobile/components/TokenIcon.tsx

import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

interface TokenIconProps {
  code: string;
  image?: string | null;
  size?: number;
}

const PLACEHOLDER = require('../assets/token-placeholder.png');

export function TokenIcon({ code, image, size = 40 }: TokenIconProps) {
  const [failed, setFailed] = React.useState(false);

  if (image && !failed) {
    return (
      <Image
        source={{ uri: image }}
        style={[styles.icon, { width: size, height: size, borderRadius: size / 2 }]}
        onError={() => setFailed(true)}
        resizeMode="contain"
      />
    );
  }

  // Letter-based placeholder
  const initials = code.substring(0, 2).toUpperCase();
  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    backgroundColor: '#1a1a2e',
  },
  placeholder: {
    backgroundColor: '#2a2a4a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

export default TokenIcon;

