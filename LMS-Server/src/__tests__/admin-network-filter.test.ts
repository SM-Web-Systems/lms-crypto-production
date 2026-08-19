/**
 * admin-network-filter.test.ts — Network filter for issued credentials
 *
 * ANF-1: Returns all credentials when no network filter
 * ANF-2: Filters to testnet-only when ?network=testnet
 * ANF-3: Filters to public-only when ?network=public
 * ANF-4: Ignores invalid network value
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

function seedAdminAndCredentials(): { token: string; testnetCredId: string; publicCredId: string } {
  const adminId = uuidv4();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, 'anf-admin@test.com', 'ANF Admin', 'hash', 'admin')`)
    .run(adminId);

  const studentId = uuidv4();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, 'anf-student@test.com', 'ANF Student', 'hash', 'student')`)
    .run(studentId);

  const testnetCredId = uuidv4();
  db.prepare(
    `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network)
     VALUES (?, ?, 'GWALLET', 'minted', 'CTEST', 'testnet')`
  ).run(testnetCredId, studentId);

  const publicCredId = uuidv4();
  db.prepare(
    `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network)
     VALUES (?, ?, 'GWALLET', 'minted', 'CPROD', 'public')`
  ).run(publicCredId, studentId);

  const token = makeToken({ userId: adminId, email: 'anf-admin@test.com', role: 'admin' });

  return { token, testnetCredId, publicCredId };
}

describe('GET /api/v1/admin/issued-credentials?network=', () => {
  it('ANF-1: returns both when no network filter', async () => {
    const { token, testnetCredId, publicCredId } = seedAdminAndCredentials();
    const res = await request(app)
      .get('/api/v1/admin/issued-credentials')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.credentials.map((c: { credentialId: string }) => c.credentialId);
    expect(ids).toContain(testnetCredId);
    expect(ids).toContain(publicCredId);
  });

  it('ANF-2: filters to testnet when ?network=testnet', async () => {
    const { token } = seedAdminAndCredentials();
    const res = await request(app)
      .get('/api/v1/admin/issued-credentials?network=testnet')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const networks = res.body.data.credentials.map((c: { network: string }) => c.network);
    expect(networks.length).toBeGreaterThan(0);
    for (const n of networks) {
      expect(n).toBe('testnet');
    }
  });

  it('ANF-3: filters to public when ?network=public', async () => {
    const { token } = seedAdminAndCredentials();
    const res = await request(app)
      .get('/api/v1/admin/issued-credentials?network=public')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const networks = res.body.data.credentials.map((c: { network: string }) => c.network);
    expect(networks.length).toBeGreaterThan(0);
    for (const n of networks) {
      expect(n).toBe('public');
    }
  });

  it('ANF-4: ignores invalid network value', async () => {
    const { token, testnetCredId, publicCredId } = seedAdminAndCredentials();
    const res = await request(app)
      .get('/api/v1/admin/issued-credentials?network=mainnet')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.credentials.map((c: { credentialId: string }) => c.credentialId);
    expect(ids).toContain(testnetCredId);
    expect(ids).toContain(publicCredId);
  });
});
