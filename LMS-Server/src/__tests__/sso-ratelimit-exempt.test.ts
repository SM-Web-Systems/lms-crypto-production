/**
 * SSO-RL-001 — SSO redirect routes (amma-login, amma-callback) must be
 * exempt from the strict auth rate limiter so users can always initiate
 * SSO flows without hitting 429.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('SSO-RL-001 — SSO routes exempt from auth rate limiter', () => {
  it('GET /api/v1/auth/amma-login should not return 429 even after many requests', async () => {
    // Fire enough requests to exceed the auth rate limit (60/15min in prod, 200 in dev)
    const results: number[] = [];
    for (let i = 0; i < 65; i++) {
      const res = await request(app).get('/api/v1/auth/amma-login');
      results.push(res.status);
    }
    // Should get 302 redirects (SSO initiation), never 429
    const got429 = results.some(s => s === 429);
    expect(got429).toBe(false);
    // All should be 302 (redirect to AmmaWallet)
    expect(results.every(s => s === 302)).toBe(true);
  });

  it('POST /api/v1/auth/login should still be rate-limited', async () => {
    // Verify that non-SSO auth routes remain protected
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    // Should have rate limit headers (confirms limiter is active)
    expect(res.headers).toHaveProperty('ratelimit-limit');
  });
});
