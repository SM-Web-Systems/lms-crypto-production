/**
 * RL-001 — Request logger sets x-request-id header
 * RL-002 — Request logger honors incoming x-request-id
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('RL-001 — Request logger generates correlation ID', () => {
  it('should set x-request-id response header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe('RL-002 — Request logger honors incoming x-request-id', () => {
  it('should echo back the provided x-request-id', async () => {
    const customId = 'custom-trace-id-12345';
    const res = await request(app)
      .get('/health')
      .set('x-request-id', customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });
});
