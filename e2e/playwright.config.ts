import { assertFixtureConfiguration } from './helpers/fixture-db';
import { defineConfig, devices } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATABASE_PATH ||= path.join(tmpdir(), `lms-e2e-${randomUUID()}.db`);

process.env.E2E_FIXTURE_MODE = '1';
process.env.E2E_SYNTHETIC_HMAC_KEY ||= `auth13-fixture-${randomBytes(32).toString('hex')}`;
if (!/^auth13-fixture-[a-f0-9]{64}$/.test(process.env.E2E_SYNTHETIC_HMAC_KEY)) throw new Error('Synthetic E2E HMAC required');
process.env.PAYSTACK_SECRET_KEY = process.env.E2E_SYNTHETIC_HMAC_KEY;

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const apiURL = process.env.E2E_API_URL || 'http://localhost:3001';
assertFixtureConfiguration();

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
      command: 'cd ../LMS-Server && npm run build && npm run db:init -- --initialize-new && node --require ../e2e/helpers/no-external-network.cjs dist/server.js',
      url: `${apiURL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
        JWT_SECRET: 'e2e-test-jwt-secret-do-not-use-in-production',
        SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
        AMMA_WALLET_URL: 'http://127.0.0.1:1/', AMMA_WALLET_API_KEY: '',
        AMMA_WALLET_TIMEOUT_MS: '500',
        DATABASE_PATH: process.env.DATABASE_PATH,
        PAYSTACK_SECRET_KEY: process.env.E2E_SYNTHETIC_HMAC_KEY,
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
