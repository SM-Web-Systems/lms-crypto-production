/**
 * credentials-public.test.ts
 *
 * Tests for GET /api/v1/credentials/public?wallet=<address>
 *
 * CA-1: sorobanTokenId included in response for a minted credential that has it
 * CA-2: sorobanTokenId is null for legacy credentials (no soroban_token_id in DB)
 * CA-3: only minted credentials are returned (pending/failed excluded)
 * CA-4: only credentials for the queried wallet are returned
 * CA-5: unknown wallet returns empty array, not 404
 * CA-6: missing wallet param returns 400
 * CA-7: nft_credentials table has soroban_token_id column (schema regression guard)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';

// Wallet addresses used in tests — fake but structurally valid for query params
const TEST_WALLET = 'GBOHFMJWVGMYTWWBKRTDAZZ2MYXGKOVZWEW3JFPVJ4EK3CYG7GVIWGEJ';
const OTHER_WALLET = 'GDPOFQ7YDGLMFVWZ2LRKLQFN7KQBJ5UVTVF6TVVQ5G5WALLET2TESTXX';

/** Insert a minimal user row and return its id */
function seedUser(): string {
  const userId = uuidv4();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
     VALUES (?, 'Cred Test User', ?, 'hash', 'student', ?, 'linked')`
  ).run(userId, `cred-test-${userId}@test.com`, TEST_WALLET);
  return userId;
}

/** Insert a minimal course row and return its id */
function seedCourse(): { courseId: string; courseCode: string; courseTitle: string } {
  const courseId = uuidv4();
  const courseCode = `CRED-${uuidv4().slice(0, 6).toUpperCase()}`;
  const courseTitle = 'Credential Test Course';
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections)
     VALUES (?, ?, 'desc', ?, '[]')`
  ).run(courseId, courseTitle, courseCode);
  return { courseId, courseCode, courseTitle };
}

// ── CA-7: schema guard — soroban_token_id column exists ─────────────────────

describe('nft_credentials schema', () => {
  it('CA-7: soroban_token_id column exists in nft_credentials table', () => {
    const cols = db
      .prepare('PRAGMA table_info(nft_credentials)')
      .all() as { name: string }[];
    const hasCol = cols.some((c) => c.name === 'soroban_token_id');
    expect(hasCol).toBe(true);
  });

  it('CA-7b: soroban_token_id can be stored and retrieved as an integer', () => {
    const userId = seedUser();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, wallet_address, tx_hash, soroban_token_id, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'txhash-schema', 99, 'minted', 'CCONTRACT', 'public')`
    ).run(id, userId, TEST_WALLET);

    const row = db.prepare('SELECT soroban_token_id FROM nft_credentials WHERE id = ?').get(id) as
      | { soroban_token_id: number | null }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.soroban_token_id).toBe(99);
  });
});

// ── GET /api/v1/credentials/public ──────────────────────────────────────────

describe('GET /api/v1/credentials/public', () => {
  it('CA-1: returns sorobanTokenId for a minted credential that has one', async () => {
    const userId = seedUser();
    const { courseId } = seedCourse();

    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, course_id, wallet_address, tx_hash, soroban_token_id, mint_status, contract_id, network)
       VALUES (?, ?, ?, ?, 'txhash-ca1', 42, 'minted', 'CCONTRACT', 'public')`
    ).run(uuidv4(), userId, courseId, TEST_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.credentials).toHaveLength(1);
    expect(res.body.data.credentials[0].sorobanTokenId).toBe(42);
  });

  it('CA-2: sorobanTokenId is null for a legacy credential (no soroban_token_id in DB)', async () => {
    const userId = seedUser();

    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, wallet_address, tx_hash, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'txhash-ca2', 'minted', 'CCONTRACT', 'public')`
    ).run(uuidv4(), userId, TEST_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    expect(res.body.data.credentials).toHaveLength(1);
    expect(res.body.data.credentials[0].sorobanTokenId).toBeNull();
  });

  it('CA-3: only minted credentials are returned (pending and failed are excluded)', async () => {
    const userId = seedUser();

    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, wallet_address, tx_hash, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'tx-minted', 'minted', 'CCONTRACT', 'public')`
    ).run('cred-minted-ca3', userId, TEST_WALLET);

    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'pending', 'CCONTRACT', 'public')`
    ).run('cred-pending-ca3', userId, TEST_WALLET);

    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, wallet_address, error, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'failed reason', 'failed', 'CCONTRACT', 'public')`
    ).run('cred-failed-ca3', userId, TEST_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    expect(res.body.data.credentials).toHaveLength(1);
    expect(res.body.data.credentials[0].credentialId).toBe('cred-minted-ca3');
  });

  it('CA-4: only credentials for the queried wallet are returned', async () => {
    const userId = seedUser();

    // Insert a second user with OTHER_WALLET
    const otherUserId = uuidv4();
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
       VALUES (?, 'Other User', ?, 'hash', 'student', ?, 'linked')`
    ).run(otherUserId, `other-ca4-${otherUserId}@test.com`, OTHER_WALLET);

    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, wallet_address, tx_hash, soroban_token_id, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'tx-a', 1, 'minted', 'CCONTRACT', 'public')`
    ).run('cred-wallet-a-ca4', userId, TEST_WALLET);

    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, wallet_address, tx_hash, soroban_token_id, mint_status, contract_id, network)
       VALUES (?, ?, ?, 'tx-b', 2, 'minted', 'CCONTRACT', 'public')`
    ).run('cred-wallet-b-ca4', otherUserId, OTHER_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    expect(res.body.data.credentials).toHaveLength(1);
    expect(res.body.data.credentials[0].credentialId).toBe('cred-wallet-a-ca4');
  });

  it('CA-5: unknown wallet returns empty array, not 404', async () => {
    const res = await request(app)
      .get('/api/v1/credentials/public?wallet=GNOBODYHASTHISWALLET')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.credentials).toEqual([]);
  });

  it('CA-6: missing wallet param returns 400', async () => {
    const res = await request(app)
      .get('/api/v1/credentials/public')
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('CA-8: response includes courseTitle and courseCode when credential is course-linked', async () => {
    const userId = seedUser();
    const { courseId, courseTitle, courseCode } = seedCourse();

    db.prepare(
      `INSERT INTO nft_credentials
         (id, user_id, course_id, wallet_address, tx_hash, soroban_token_id, mint_status, contract_id, network)
       VALUES (?, ?, ?, ?, 'txhash-ca8', 7, 'minted', 'CCONTRACT', 'public')`
    ).run(uuidv4(), userId, courseId, TEST_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    const cred = res.body.data.credentials[0];
    expect(cred.sorobanTokenId).toBe(7);
    expect(cred.courseId).toBe(courseId);
    expect(cred.courseTitle).toBe(courseTitle);
    expect(cred.courseCode).toBe(courseCode);
  });
});
