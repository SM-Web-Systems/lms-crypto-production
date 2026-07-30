/**
 * LMS-RATE-004 — CORS must allow PATCH method.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('LMS-RATE-004 — CORS includes PATCH', () => {
  it('OPTIONS preflight includes PATCH in Access-Control-Allow-Methods', async () => {
    const res = await request(app)
      .options('/api/v1/users')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PATCH');

    const methods = res.headers['access-control-allow-methods'] || '';
    expect(methods.toUpperCase()).toContain('PATCH');
  });
});
