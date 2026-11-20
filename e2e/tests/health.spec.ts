import { test, expect } from '@playwright/test';
import { apiURL } from '../playwright.config';

test.describe('Health smoke test', () => {
  test('GET /health returns 200 with status ok', async ({ request }) => {
    const response = await request.get(`${apiURL}/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('GET /api/v1/health returns the trimmed public status', async ({ request }) => {
    const response = await request.get(`${apiURL}/api/v1/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.checks.db.status).toBe('ok');
    expect(typeof body.buildSha).toBe('string');
    expect(body.writerHold).toBeDefined();
    // Runtime detail is not public (audit 2026-11 M2).
    expect(body).not.toHaveProperty('uptime');
    expect(body.checks).not.toHaveProperty('memory');
  });
});

test.describe('Readiness smoke test', () => {
  test('SMOKE-001: GET /healthz returns 200', async ({ request }) => {
    const response = await request.get(`${apiURL}/healthz`);
    expect(response.status()).toBe(200);
  });

  test('SMOKE-002: GET /healthz returns ready: true with all checks', async ({ request }) => {
    const response = await request.get(`${apiURL}/healthz`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ready).toBe(true);
    expect(body.checks.db_read.ok).toBe(true);
    expect(body.checks.db_write.ok).toBe(true);
    expect(body.checks.disk.ok).toBe(true);
  });
});
