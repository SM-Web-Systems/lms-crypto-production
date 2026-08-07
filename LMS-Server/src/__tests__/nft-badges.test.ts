/**
 * nft-badges.test.ts — Phase 23 C4
 *
 * BADGE-1: GET /credentials/verify/:id returns credential for minted, non-superseded
 * BADGE-2: GET /credentials/verify/:id returns 404 for non-existent ID
 * BADGE-3: GET /credentials/verify/:id returns 404 for superseded credential
 * BADGE-4: GET /credentials/verify/:id returns 404 for pending credential
 * BADGE-5: GET /credentials/:id/pdf returns PDF for minted credential
 * BADGE-6: GET /credentials/:id/pdf returns 404 for non-existent credential
 * BADGE-7: PDF contains QR code image data (buffer large enough)
 * BADGE-8: PDF still returns correct content-type after QR addition
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';

const BASE = '/api/v1';
const WALLET = 'GBOHFMJWVGMYTWWBKRTDAZZ2MYXGKOVZWEW3JFPVJ4EK3CYG7BADGE01';

let userId: string;
let courseId: string;
let mintedCredId: string;
let supersededCredId: string;
let pendingCredId: string;

function seedData() {
  userId = uuidv4();
  courseId = uuidv4();
  mintedCredId = uuidv4();
  supersededCredId = uuidv4();
  pendingCredId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
     VALUES (?, 'Alice Badge', ?, 'hash', 'student', ?, 'linked')`,
  ).run(userId, `badge-test-${userId}@test.com`, WALLET);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections)
     VALUES (?, 'Blockchain 101', 'Intro course', 'BVC-101', '[]')`,
  ).run(courseId);

  // Minted, non-superseded
  db.prepare(
    `INSERT INTO nft_credentials
       (id, user_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, soroban_token_id, is_superseded)
     VALUES (?, ?, ?, 'minted', 'abc123txhash', 'CDPKSOOE4UZF', 'public', ?, 42, 0)`,
  ).run(mintedCredId, userId, WALLET, courseId);

  // Minted but superseded
  db.prepare(
    `INSERT INTO nft_credentials
       (id, user_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, soroban_token_id, is_superseded)
     VALUES (?, ?, ?, 'minted', 'old_tx', 'CDPKSOOE4UZF', 'public', ?, 41, 1)`,
  ).run(supersededCredId, userId, WALLET, courseId);

  // Pending
  db.prepare(
    `INSERT INTO nft_credentials
       (id, user_id, wallet_address, mint_status, contract_id, network, course_id, is_superseded)
     VALUES (?, ?, ?, 'pending', 'CDPKSOOE4UZF', 'public', ?, 0)`,
  ).run(pendingCredId, userId, WALLET, courseId);
}

beforeEach(() => {
  seedData();
});

describe('GET /credentials/verify/:credentialId', () => {
  it('BADGE-1: returns credential for minted, non-superseded', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/verify/${mintedCredId}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const cred = res.body.data.credential;
    expect(cred.credentialId).toBe(mintedCredId);
    expect(cred.studentName).toBe('Alice Badge');
    expect(cred.courseTitle).toBe('Blockchain 101');
    expect(cred.courseCode).toBe('BVC-101');
    expect(cred.txHash).toBe('abc123txhash');
    expect(cred.sorobanTokenId).toBe(42);
    expect(cred.issuer).toBe('SM Web Systems Blockchain Academy');
    expect(cred.contractId).toBe('CDPKSOOE4UZF');
    expect(cred.network).toBe('public');
  });

  it('BADGE-2: returns 404 for non-existent ID', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/verify/${uuidv4()}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('BADGE-3: returns 404 for superseded credential', async () => {
    await request(app)
      .get(`${BASE}/credentials/verify/${supersededCredId}`)
      .expect(404);
  });

  it('BADGE-4: returns 404 for pending credential', async () => {
    await request(app)
      .get(`${BASE}/credentials/verify/${pendingCredId}`)
      .expect(404);
  });
});

describe('GET /credentials/:credentialId/pdf', () => {
  it('BADGE-5: returns PDF for minted credential', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/${mintedCredId}/pdf`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('certificate-');
    expect(res.body.length).toBeGreaterThan(100);
  });

  it('BADGE-6: returns 404 for non-existent credential', async () => {
    await request(app)
      .get(`${BASE}/credentials/${uuidv4()}/pdf`)
      .expect(404);
  });

  it('BADGE-7: PDF contains QR code image data (buffer large enough)', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/${mintedCredId}/pdf`)
      .expect(200);

    // A PDF with an embedded QR PNG should be significantly larger than 2KB
    expect(res.body.length).toBeGreaterThan(2000);
  });

  it('BADGE-8: PDF still returns correct content-type after QR addition', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/${mintedCredId}/pdf`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('certificate-');
  });
});
