/**
 * Tests for GET /api/v1/credentials/mine (L-015 auth-gated endpoint).
 *
 * CME1 — 401 when no token
 * CME2 — 200 empty array when authenticated but no minted credentials
 * CME3 — 200 with matching rows for a seeded user (filters by user_id, only minted)
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(suffix: string) {
  const userId = uuidv4();
  const courseId = uuidv4();
  const code = `CME-${uuidv4().slice(0, 8)}`;

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'CME Student', 'cme-${suffix}@test.com', '${HASH}', 'student',
            'GCMEWALLET${userId.slice(0,8).toUpperCase()}', 'linked');

    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', 'CME Course', '${code}', '[]');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${userId}', '${code}');
  `);

  return { userId, courseId, code };
}

function seedCredential(userId: string, courseId: string, status: string = 'minted') {
  const credId = uuidv4();
  db.exec(`
    INSERT INTO nft_credentials
      (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, course_id)
    VALUES
      ('${credId}', '${userId}', NULL, 'GCMEWALLET${userId.slice(0,8).toUpperCase()}', '${status}',
       'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524', 'public', '${courseId}');
  `);
  return credId;
}

// ─── CME1 ────────────────────────────────────────────────────────────────────
describe('CME1 — unauthenticated request returns 401', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/credentials/mine');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/credentials/mine')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});

// ─── CME2 ────────────────────────────────────────────────────────────────────
describe('CME2 — authenticated student with no credentials returns empty array', () => {
  it('returns 200 with empty credentials array', async () => {
    const { userId } = seedUser('cme2');
    const token = makeToken({ userId, email: `cme-cme2@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/credentials/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.credentials).toEqual([]);
  });

  it('does not return failed credentials (only minted)', async () => {
    const { userId, courseId } = seedUser('cme2b');
    seedCredential(userId, courseId, 'failed');
    const token = makeToken({ userId, email: `cme-cme2b@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/credentials/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.credentials).toHaveLength(0);
  });
});

// ─── CME3 ────────────────────────────────────────────────────────────────────
describe('CME3 — returns only the authenticated user\'s minted credentials', () => {
  it('returns matching credential with course context', async () => {
    const { userId, courseId } = seedUser('cme3a');
    seedCredential(userId, courseId, 'minted');
    const token = makeToken({ userId, email: `cme-cme3a@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/credentials/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.credentials).toHaveLength(1);
    const cred = res.body.data.credentials[0];
    expect(cred.walletAddress).toMatch(/^GCMEWALLET/);
    expect(cred.courseId).toBe(courseId);
    expect(cred.issuedAt).toBeTruthy();
  });

  it('does not return another user\'s credentials', async () => {
    const userA = seedUser('cme3b');
    const userB = seedUser('cme3c');
    // Only seed a credential for userA
    seedCredential(userA.userId, userA.courseId, 'minted');

    const tokenB = makeToken({ userId: userB.userId, email: `cme-cme3c@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/credentials/mine')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.data.credentials).toHaveLength(0);
  });

  it('returns multiple credentials ordered by issuedAt DESC', async () => {
    const { userId, courseId } = seedUser('cme3d');
    const cred1 = uuidv4();
    const cred2 = uuidv4();
    db.exec(`
      INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, course_id, created_at)
      VALUES
        ('${cred1}', '${userId}', NULL, 'GCMEWALLET${userId.slice(0,8).toUpperCase()}', 'minted',
         'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524', 'public', '${courseId}', '2026-07-01 10:00:00'),
        ('${cred2}', '${userId}', NULL, 'GCMEWALLET${userId.slice(0,8).toUpperCase()}', 'minted',
         'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524', 'public', '${courseId}', '2026-07-02 10:00:00');
    `);
    const token = makeToken({ userId, email: `cme-cme3d@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/credentials/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.credentials).toHaveLength(2);
    // Most recent first
    expect(res.body.data.credentials[0].issuedAt > res.body.data.credentials[1].issuedAt).toBe(true);
  });
});
