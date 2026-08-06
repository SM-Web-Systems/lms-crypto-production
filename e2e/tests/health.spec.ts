import { test, expect } from '@playwright/test';
import { apiURL } from '../playwright.config';

test.describe('Health smoke test', () => {
  test('GET /health returns 200 with status ok', async ({ request }) => {
    const response = await request.get(`${apiURL}/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('GET /api/v1/health returns enhanced status', async ({ request }) => {
    const response = await request.get(`${apiURL}/api/v1/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.checks).toBeDefined();
    expect(body.uptime).toBeGreaterThan(0);
  });
});
