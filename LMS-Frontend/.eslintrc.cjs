module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // A leading underscore marks a parameter or variable that is kept on purpose (an interface
    // signature, or a value read only for its side effect).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
    ],
  },
  overrides: [
    {
      // Test mocks and fixtures use `any` to stand in for partial objects; app code stays strict.
      files: ['src/__tests__/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
}

