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
    // react-hooks 7 adds the React Compiler rules. rules-of-hooks, exhaustive-deps and the other
    // compiler checks stay on. These four flag patterns the app uses on purpose and would need a
    // wide refactor for no behaviour change, so they stay off until we adopt the React Compiler:
    // set-state-in-effect (82 load-on-mount effects), refs (the "latest value" ref pattern in
    // ConfirmDialog, Modal, Pagination, useConfirmAction, SsoCallback), globals (test mocks that
    // reassign module variables) and preserve-manual-memoization (one useCallback in Profile).
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/refs': 'off',
    'react-hooks/globals': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
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

