/**
 * reconciliation.test.ts — Timeout-then-success transaction reconciliation
 *
 * REC-1: getHorizonUrl returns correct URL for public
 * REC-2: getHorizonUrl returns correct URL for testnet
 * REC-3: reconcileCredential returns ineligible for non-existent credential
 * REC-4: reconcileCredential returns ineligible for already-minted credential
 * REC-5: reconcileCredential returns ineligible for credential without tx_hash
 * REC-6: Admin endpoint requires authentication
 * REC-7: Admin endpoint returns ineligible for non-existent credential
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { getHorizonUrl, reconcileCredential } from '../services/reconciliationService.js';

function seedUser(): string {
  const id = uuidv4();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'Rec Student', 'hash', 'student')`)
    .run(id, `rec-${id}@test.com`);
  return id;
}

function seedAdmin(): { adminId: string; token: string } {
  const adminId = uuidv4();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, 'rec-admin@test.com', 'Rec Admin', 'hash', 'admin')`)
    .run(adminId);
  const token = makeToken({ userId: adminId, email: 'rec-admin@test.com', role: 'admin' });
  return { adminId, token };
}

describe('Reconciliation Service — getHorizonUrl', () => {
  it('REC-1: returns correct Horizon URL for public network', () => {
    expect(getHorizonUrl('public')).toBe('https://horizon.stellar.org');
  });

  it('REC-2: returns correct Horizon URL for testnet network', () => {
    expect(getHorizonUrl('testnet')).toBe('https://horizon-testnet.stellar.org');
  });
});

describe('Reconciliation Service — reconcileCredential', () => {
  it('REC-3: returns ineligible for non-existent credential', async () => {
    const result = await reconcileCredential('nonexistent-id');
    expect(result.status).toBe('ineligible');
    expect(result.reason).toContain('not found');
  });

  it('REC-4: returns ineligible for already-minted credential', async () => {
    const userId = seedUser();
    const credId = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, tx_hash)
       VALUES (?, ?, 'GWALLET', 'minted', 'CTEST', 'testnet', 'somehash')`
    ).run(credId, userId);

    const result = await reconcileCredential(credId);
    expect(result.status).toBe('ineligible');
    expect(result.reason).toContain('minted');
  });

  it('REC-5: returns ineligible for credential without tx_hash', async () => {
    const userId = seedUser();
    const credId = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, 'GWALLET', 'failed', 'CTEST', 'testnet')`
    ).run(credId, userId);

    const result = await reconcileCredential(credId);
    expect(result.status).toBe('ineligible');
    expect(result.reason).toContain('tx_hash');
  });
});

describe('POST /api/v1/admin/credentials/:id/reconcile', () => {
  it('REC-6: requires authentication', async () => {
    const res = await request(app).post('/api/v1/admin/credentials/some-id/reconcile');
    expect(res.status).toBe(401);
  });

  it('REC-7: returns ineligible for non-existent credential', async () => {
    const { token } = seedAdmin();
    const res = await request(app)
      .post('/api/v1/admin/credentials/nonexistent/reconcile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ineligible');
  });
});
