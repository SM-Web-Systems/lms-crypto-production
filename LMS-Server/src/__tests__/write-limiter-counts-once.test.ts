import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

/**
 * Regression: many routers share '/api/v1', each behind the same write limiter, so one write request
 * was counted once per router in front of the one that answered it (about ten times). The real limit
 * was a tenth of the configured one and normal use (create, fund, activate, retry) got a 429.
 */
describe('write limiter counts each request once', () => {
  it('uses exactly one request of the quota per POST, however far down the route list it is answered', async () => {
    const remaining: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/v1/teacher/rewards').set('X-Forwarded-For', '203.0.113.77').send({});
      expect(res.status).toBe(401);
      remaining.push(Number(res.headers['ratelimit-remaining']));
    }
    expect(remaining[0] - remaining[3]).toBe(3);
  });

  it('does not count reads against the write quota', async () => {
    const ip = '203.0.113.78';
    const before = await request(app).post('/api/v1/teacher/rewards').set('X-Forwarded-For', ip).send({});
    await request(app).get('/api/v1/teacher/rewards').set('X-Forwarded-For', ip);
    await request(app).get('/api/v1/teacher/rewards').set('X-Forwarded-For', ip);
    const after = await request(app).post('/api/v1/teacher/rewards').set('X-Forwarded-For', ip).send({});
    expect(Number(before.headers['ratelimit-remaining']) - Number(after.headers['ratelimit-remaining'])).toBe(1);
  });

  it('counts each read once against the global read limit', async () => {
    const ip = '203.0.113.79';
    const a = await request(app).get('/api/v1/teacher/rewards').set('X-Forwarded-For', ip);
    const b = await request(app).get('/api/v1/teacher/rewards').set('X-Forwarded-For', ip);
    expect(Number(a.headers['ratelimit-remaining']) - Number(b.headers['ratelimit-remaining'])).toBe(1);
  });
});
