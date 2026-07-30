import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 10000,
    env: {
      JWT_SECRET: 'test-only-jwt-secret-do-not-use-in-production',
    },
    // SQLite in-memory DB is per-module-instance; run files sequentially to avoid
    // parallel workers sharing state (each file gets its own clean reset via _resetForTests).
    fileParallelism: false,
  },
});
