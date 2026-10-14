/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|axios)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },
  setupFiles: ['./jest.setup.js'],
  testMatch: ['**/__tests__/**/*.(test|spec).(ts|tsx)', '**/*.(test|spec).(ts|tsx)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**/_layout.tsx',
  ],
};
