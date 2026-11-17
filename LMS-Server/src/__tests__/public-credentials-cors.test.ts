import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import app from '../app.js';

const route = '/api/v1/credentials/public?wallet=GBCXALJNT67JWF2LOWDXJRIHEO7UWNLT6AO3YXBKJMPBFZTEEPBALACA';

describe('public certificate list: access from the wallet pages', () => {
  it('allows the wallet origin to read it, with the origin echoed and Vary set', async () => {
    const res = await request(app).get(route).set('Origin', 'https://ammawallet.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://ammawallet.com');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers.vary).toMatch(/Origin/);
    expect(res.body.data.credentials).toEqual([]);
  });

  it('answers the preflight for the wallet origin and refuses any other origin cleanly', async () => {
    const pre = await request(app).options('/api/v1/credentials/public').set('Origin', 'https://testnet.ammawallet.com').set('Access-Control-Request-Method', 'GET');
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-methods']).toBe('GET, OPTIONS');
    const other = await request(app).get(route).set('Origin', 'https://evil.example');
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('still works without an Origin header (server to server), and does not open other routes to the wallet origin', async () => {
    expect((await request(app).get(route)).status).toBe(200);
    const other = await request(app).get('/api/v1/health').set('Origin', 'https://ammawallet.com');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
