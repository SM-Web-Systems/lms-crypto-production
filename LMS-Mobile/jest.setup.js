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
  downloadAsync: jest.fn().mockResolvedValue({ uri: '/tmp/test.pdf', status: 200 }),
  documentDirectory: '/tmp/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
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
  useNavigation: jest.fn(() => ({ getState: () => undefined, reset: jest.fn(), setOptions: jest.fn() })),
  // Screens load on focus; in tests the first render is the focus.
  useFocusEffect: jest.fn((cb) => require('react').useEffect(() => cb(), [cb])),
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

// RN exposes lazy getters, including the primitives RNTL loads to discover host
// names on its first render. Transform them during setup rather than charging
// cold Babel work to whichever timed interaction happens to run first.
const nativeComponents = require('react-native');
for (const name of ['Text', 'Pressable', 'View', 'ActivityIndicator', 'TextInput',
  'Image', 'Switch', 'ScrollView', 'Modal']) void nativeComponents[name];

// react-native-webview needs its native module; tests that care about the WebView mock it themselves.
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

// In-memory AsyncStorage (learning mode and plays saved while offline).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Native players are not available in Jest; suites that test playback mock these themselves.
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }), currentTime: 0, duration: 0 }),
  VideoView: 'VideoView',
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), remove: jest.fn() }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 0, playing: false, didJustFinish: false }),
}));
