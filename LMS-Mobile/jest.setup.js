// Mock expo-secure-store (not available in test environment)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-file-system (legacy API used for download)
jest.mock('expo-file-system/legacy', () => ({
  downloadAsync: jest.fn().mockResolvedValue({ uri: '/tmp/test.pdf' }),
  documentDirectory: '/tmp/',
}));
jest.mock('expo-file-system', () => ({}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-clipboard
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({})),
  Link: 'Link',
  Tabs: { Screen: 'TabsScreen' },
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const mockIonicons = 'Ionicons';
  return { Ionicons: mockIonicons };
});

// Suppress NativeWind warnings in test
jest.mock('nativewind', () => ({}));
jest.mock('react-native-css-interop', () => ({
  cssInterop: jest.fn(),
}));
