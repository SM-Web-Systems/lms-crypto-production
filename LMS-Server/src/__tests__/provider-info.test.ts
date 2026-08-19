/**
 * provider-info.test.ts — Provider info in integration-status endpoint
 *
 * PI-1: GET /admin/integration-status includes nftProvider field
 * PI-2: nftProvider shows name and version but no secrets
 */

import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { _resetProviderCache } from '../services/nftProvider.js';

function seedAdmin(): string {
  const adminId = uuidv4();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'PI Admin', 'hash', 'admin')`)
    .run(adminId, `pi-admin-${adminId}@test.com`);
  return makeToken({ userId: adminId, email: `pi-admin-${adminId}@test.com`, role: 'admin' });
}

describe('GET /api/v1/admin/integration-status — nftProvider', () => {
  afterEach(() => {
    _resetProviderCache();
    delete process.env.NFT_PROVIDER;
  });

  it('PI-1: includes nftProvider field with name and version', async () => {
    const token = seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/integration-status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.nftProvider).toBeDefined();
    expect(res.body.nftProvider.name).toBe('legacy-stellar');
    expect(res.body.nftProvider.version).toBe('1.0.0');
  });

  it('PI-2: nftProvider contains no secrets', async () => {
    const token = seedAdmin();
    const res = await request(app)
      .get('/api/v1/admin/integration-status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body.nftProvider);
    expect(body).not.toContain('SECRET');
    expect(body).not.toContain('PRIVATE');
    expect(body).not.toContain('SEED');
    expect(body).not.toContain('MINTER');
    expect(res.body.nftProvider.capabilities).toBeDefined();
  });
});
