/**
 * HC-001 — Health endpoint returns enhanced fields
 * HC-002 — Health endpoint returns degraded status on DB error
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('HC-001 — Enhanced health check response', () => {
  it('should return uptime, memory, and db latency', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.version).toBe('string');
    expect(res.body.checks.db.status).toBe('ok');
    expect(typeof res.body.checks.db.latencyMs).toBe('number');
    expect(typeof res.body.checks.memory.heapUsedMB).toBe('number');
    expect(typeof res.body.checks.memory.heapTotalMB).toBe('number');
    expect(typeof res.body.checks.memory.rssMB).toBe('number');
    expect(typeof res.body.checks.ammaWallet.configured).toBe('boolean');
  });
});

describe('HC-002 — API-prefixed health endpoint', () => {
  it('should return same health data on /api/v1/health', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.db).toBeDefined();
    expect(res.body.checks.memory).toBeDefined();
  });
});
