/**
 * L-013 Re-mint credential flow
 *
 * RM1 — 401 when no token
 * RM2 — 403 when non-admin (student) token
 * RM3 — 404 when credential does not exist
 * RM4 — 422 when credential status is not 'minted'
 * RM5 — 422 when credential is already superseded
 * RM6 — 422 when credential has no course_id (quiz-only)
 * RM7 — 200 happy path: new credential created, old marked superseded, application updated
 * RM8 — 200 with wallet override: new credential uses override wallet
 * RM9 — 502 when mintCredential throws
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, queryOne } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import * as mintModule from '../services/mintService.js';

const HASH = bcrypt.hashSync('password123', 4);
const FAKE_TX = 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3';
const FAKE_TX2 = 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const CONTRACT_ID = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';
const WALLET = 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I';
const WALLET2 = 'GDLQEPIWVJQENAP3AJDBI6EXB6P2ZND7266P5DNVEATLRWD422IXRPTQ';

function seedBase() {
  const adminId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES
      ('${adminId}',   'RM Admin',   'rm-admin@test.com',   '${HASH}', 'admin',   '${WALLET}',  'linked'),
      ('${studentId}', 'RM Student', 'rm-student@test.com', '${HASH}', 'student', '${WALLET2}', 'linked');
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', 'RM Course', 'RM-001', '[]');
  `);
  return { adminId, studentId, courseId };
}

function seedMintedCred(userId: string, courseId: string, appId: string | null = null) {
  const credId = uuidv4();
  db.exec(`
    INSERT INTO nft_credentials
      (id, user_id, quiz_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, application_id, is_superseded)
    VALUES ('${credId}', '${userId}', NULL, '${WALLET}', 'minted', '${FAKE_TX}', '${CONTRACT_ID}', 'public', '${courseId}', ${appId ? `'${appId}'` : 'NULL'}, 0);
  `);
  return credId;
}

function seedApp(userId: string, courseId: string, credId: string) {
  const appId = uuidv4();
  db.exec(`
    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${userId}', 'RM-001');
    INSERT INTO course_nft_applications
      (id, user_id, course_id, wallet_address, status, credential_id, tx_hash)
    VALUES ('${appId}', '${userId}', '${courseId}', '${WALLET}', 'minted', '${credId}', '${FAKE_TX}');
  `);
  return appId;
}

// ─── Spy lifecycle ─────────────────────────────────────────────────────────────

let mintSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env.NFT_CONTRACT_ID = CONTRACT_ID;
  mintSpy = vi.spyOn(mintModule, 'mintCredential').mockResolvedValue({ txHash: FAKE_TX2 });
});
afterEach(() => {
  delete process.env.NFT_CONTRACT_ID;
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/admin/credentials/:credentialId/remint', () => {
  it('RM1 — 401 when no token', async () => {
    const res = await request(app).post('/api/v1/admin/credentials/fake-id/remint');
    expect(res.status).toBe(401);
  });

  it('RM2 — 403 when student token', async () => {
    const { studentId } = seedBase();
    const token = makeToken({ userId: studentId, email: 'rm-student@test.com', role: 'student' });
    const res = await request(app)
      .post('/api/v1/admin/credentials/fake-id/remint')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('RM3 — 404 when credential not found', async () => {
    const { adminId } = seedBase();
    const token = makeToken({ userId: adminId, email: 'rm-admin@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/credentials/${uuidv4()}/remint`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('RM4 — 422 when credential status is not minted (failed)', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const credId = uuidv4();
    db.exec(`
      INSERT INTO nft_credentials
        (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, course_id, is_superseded)
      VALUES ('${credId}', '${studentId}', NULL, '${WALLET}', 'failed', '${CONTRACT_ID}', 'public', '${courseId}', 0);
    `);
    const token = makeToken({ userId: adminId, email: 'rm-admin@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/credentials/${credId}/remint`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it('RM5 — 422 when credential already superseded', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const credId = uuidv4();
    db.exec(`
      INSERT INTO nft_credentials
        (id, user_id, quiz_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, is_superseded)
      VALUES ('${credId}', '${studentId}', NULL, '${WALLET}', 'minted', '${FAKE_TX}', '${CONTRACT_ID}', 'public', '${courseId}', 1);
    `);
    const token = makeToken({ userId: adminId, email: 'rm-admin@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/credentials/${credId}/remint`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it('RM6 — 422 when credential has no course_id (quiz-only)', async () => {
    const { adminId, studentId } = seedBase();
    const credId = uuidv4();
    const quizId = uuidv4();
    db.exec(`
      INSERT INTO quizzes (id, title, course_id) VALUES ('${quizId}', 'RM Quiz', null);
      INSERT INTO nft_credentials
        (id, user_id, quiz_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, is_superseded)
      VALUES ('${credId}', '${studentId}', '${quizId}', '${WALLET}', 'minted', '${FAKE_TX}', '${CONTRACT_ID}', 'public', NULL, 0);
    `);
    const token = makeToken({ userId: adminId, email: 'rm-admin@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/credentials/${credId}/remint`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it('RM7 — 200 happy path: new cred created, old superseded, app updated', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const credId = seedMintedCred(studentId, courseId);
    const appId = seedApp(studentId, courseId, credId);
    // Update credential to link back to app
    db.exec(`UPDATE nft_credentials SET application_id = '${appId}' WHERE id = '${credId}'`);

    const token = makeToken({ userId: adminId, email: 'rm-admin@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/credentials/${credId}/remint`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.supersededCredentialId).toBe(credId);
    expect(res.body.data.txHash).toBe(FAKE_TX2);
    const newCredId: string = res.body.data.newCredentialId;
    expect(newCredId).not.toBe(credId);

    // Old credential is superseded
    const old = queryOne<{ is_superseded: number }>('SELECT is_superseded FROM nft_credentials WHERE id = ?', [credId]);
    expect(old?.is_superseded).toBe(1);

    // New credential exists and is minted
    const newCred = queryOne<{ mint_status: string; wallet_address: string; is_superseded: number }>(
      'SELECT mint_status, wallet_address, is_superseded FROM nft_credentials WHERE id = ?', [newCredId],
    );
    expect(newCred?.mint_status).toBe('minted');
    expect(newCred?.wallet_address).toBe(WALLET);
    expect(newCred?.is_superseded).toBe(0);

    // Application credential_id updated to new credential
    const appRow = queryOne<{ credential_id: string }>('SELECT credential_id FROM course_nft_applications WHERE id = ?', [appId]);
    expect(appRow?.credential_id).toBe(newCredId);

    expect(mintSpy).toHaveBeenCalledOnce();
  });

  it('RM8 — 200 with wallet override', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const credId = seedMintedCred(studentId, courseId);
    const token = makeToken({ userId: adminId, email: 'rm-admin@test.com', role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/admin/credentials/${credId}/remint`)
      .set('Authorization', `Bearer ${token}`)
      .send({ walletAddress: WALLET2 });

    expect(res.status).toBe(200);
    expect(res.body.data.walletAddress).toBe(WALLET2);
    const newCredId: string = res.body.data.newCredentialId;
    const newCred = queryOne<{ wallet_address: string }>('SELECT wallet_address FROM nft_credentials WHERE id = ?', [newCredId]);
    expect(newCred?.wallet_address).toBe(WALLET2);
  });

  it('RM9 — 502 when mintCredential throws', async () => {
    mintSpy.mockRejectedValue(new Error('Soroban simulation failed'));
    const { adminId, studentId, courseId } = seedBase();
    const credId = seedMintedCred(studentId, courseId);
    const token = makeToken({ userId: adminId, email: 'rm-admin@test.com', role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/admin/credentials/${credId}/remint`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('REMINT_FAILED');
    // Old credential should NOT be superseded when mint fails
    const old = queryOne<{ is_superseded: number }>('SELECT is_superseded FROM nft_credentials WHERE id = ?', [credId]);
    expect(old?.is_superseded).toBe(0);
  });
});
