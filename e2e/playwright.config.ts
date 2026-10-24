import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATABASE_PATH ||= path.join(tmpdir(), `lms-e2e-${randomUUID()}.db`);

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const apiURL = process.env.E2E_API_URL || 'http://localhost:3001';

export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // When running locally, start the Vite dev server automatically
  webServer: process.env.CI ? undefined : [
    {
      command: 'cd ../LMS-Server && npm run build && npm run db:init -- --initialize-new && node dist/server.js',
      url: `${apiURL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
        JWT_SECRET: 'e2e-test-jwt-secret-do-not-use-in-production',
        ADMIN_EMAILS: 'admin@test.com,superadmin@test.com',
        DATABASE_PATH: process.env.DATABASE_PATH,
        PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
      },
    },
    {
      command: 'cd ../LMS-Frontend && npx vite --port 5173',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_BASE_URL: `${apiURL}/api/v1`,
      },
    },
  ],
});

export { apiURL };
