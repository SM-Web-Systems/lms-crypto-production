/**
 * Regression tests — Certificate UX: student application status fetch.
 *
 * Covers the 2026-07-20 Certificate UX work:
 *   RCU1 — Student GET /courses/:courseId/completions/applications returns own application(s)
 *   RCU2 — Student GET returns empty array when no application exists
 *   RCU3 — Student cannot see another student's application
 *   RCU4 — Student sees minted status in their applications list
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedCertUxBase() {
  const student1Id = uuidv4();
  const student2Id = uuidv4();
  const courseId = uuidv4();
  const code = `CUX-${uuidv4().slice(0, 8)}`;

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES
      ('${student1Id}', 'CUX S1', 'cux-s1-${student1Id}@test.com', '${HASH}', 'student', 'GCUXWALLET1', 'linked'),
      ('${student2Id}', 'CUX S2', 'cux-s2-${student2Id}@test.com', '${HASH}', 'student', 'GCUXWALLET2', 'linked');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'CUX Course', 'Test', '${code}', '[]');

    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${student1Id}', '${code}');
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${student2Id}', '${code}');
  `);

  return { student1Id, student2Id, courseId };
}

function insertApp(userId: string, courseId: string, status = 'pending') {
  const appId = uuidv4();
  execute(
    `INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, applied_at)
     VALUES (?, ?, ?, 'GCUXWALLET1', ?, datetime('now'))`,
    [appId, userId, courseId, status]
  );
  return appId;
}

// ─── RCU1: Student sees own application ──────────────────────────────────────

describe('RCU1 — student GET /courses/:id/completions/applications returns own application', () => {
  it('returns the pending application for the requesting student', async () => {
    const { student1Id, courseId } = seedCertUxBase();
    const appId = insertApp(student1Id, courseId, 'pending');
    const token = makeToken({ userId: student1Id, email: `cux-s1-${student1Id}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.applications)).toBe(true);
    const ids = (res.body.data.applications as { applicationId: string }[]).map((a) => a.applicationId);
    expect(ids).toContain(appId);
  });

  it('returns approved status when application is approved', async () => {
    const { student1Id, courseId } = seedCertUxBase();
    insertApp(student1Id, courseId, 'approved');
    const token = makeToken({ userId: student1Id, email: `cux-s1-${student1Id}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const statuses = (res.body.data.applications as { status: string }[]).map((a) => a.status);
    expect(statuses).toContain('approved');
  });
});

// ─── RCU2: Empty when no application exists ───────────────────────────────────

describe('RCU2 — student GET returns empty array when no application exists', () => {
  it('returns an empty applications array', async () => {
    const { student1Id, courseId } = seedCertUxBase();
    const token = makeToken({ userId: student1Id, email: `cux-s1-${student1Id}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applications).toHaveLength(0);
  });
});

// ─── RCU3: Student cannot see another's application ──────────────────────────

describe("RCU3 — student cannot see another student's application", () => {
  it('student2 sees empty list when only student1 has an application', async () => {
    const { student1Id, student2Id, courseId } = seedCertUxBase();
    insertApp(student1Id, courseId, 'pending');
    const token = makeToken({ userId: student2Id, email: `cux-s2-${student2Id}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applications).toHaveLength(0);
  });
});

// ─── RCU4: Minted status visible in student list ─────────────────────────────

describe('RCU4 — student sees minted status in applications list', () => {
  it('returns minted status when NFT has been issued', async () => {
    const { student1Id, courseId } = seedCertUxBase();
    const appId = insertApp(student1Id, courseId, 'minted');
    const token = makeToken({ userId: student1Id, email: `cux-s1-${student1Id}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = (res.body.data.applications as { applicationId: string; status: string }[])
      .find((a) => a.applicationId === appId);
    expect(found).toBeDefined();
    expect(found?.status).toBe('minted');
  });
});

// ─── RCU5: mintError is null when no failed credential exists ─────────────────

describe('RCU5 — mintError is null when no credential row exists', () => {
  it('returns mintError: null for a pending application with no credential', async () => {
    const { student1Id, courseId } = seedCertUxBase();
    const appId = insertApp(student1Id, courseId, 'pending');
    const token = makeToken({ userId: student1Id, email: `cux-s1-${student1Id}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = (res.body.data.applications as { applicationId: string; mintError: unknown }[])
      .find((a) => a.applicationId === appId);
    expect(found).toBeDefined();
    expect(found?.mintError).toBeNull();
  });
});

// ─── RCU6: mintError is populated when a failed nft_credentials row exists ───

describe('RCU6 — mintError is populated when a failed credential row exists', () => {
  it('returns mintError string when nft_credentials has a failed row linked to the application', async () => {
    const { student1Id, courseId } = seedCertUxBase();
    const appId = insertApp(student1Id, courseId, 'approved');
    const credId = uuidv4();
    const contractId = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';
    execute(
      `INSERT INTO nft_credentials
         (id, user_id, quiz_id, wallet_address, mint_status, error, contract_id, network, course_id, application_id)
       VALUES (?, ?, NULL, 'GCUXWALLET1', 'failed', 'Soroban RPC timeout', ?, 'public', ?, ?)`,
      [credId, student1Id, contractId, courseId, appId]
    );
    const token = makeToken({ userId: student1Id, email: `cux-s1-${student1Id}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = (res.body.data.applications as { applicationId: string; mintError: string | null }[])
      .find((a) => a.applicationId === appId);
    expect(found).toBeDefined();
    expect(found?.mintError).toBe('Soroban RPC timeout');
  });
});

// ─── RCU7: wallet mismatch — application walletAddress returned correctly ─────

describe('RCU7 — wallet mismatch: application walletAddress differs from current user wallet', () => {
  it('returns the application walletAddress (at submit time) independently of current user wallet', async () => {
    const { student1Id, courseId } = seedCertUxBase();
    // App was submitted with GCUXWALLET1; user wallet is seeded as GCUXWALLET1 too
    const appId = insertApp(student1Id, courseId, 'approved');
    // Simulate wallet change: update users table to a new walletAddress
    execute(`UPDATE users SET walletAddress = 'GNEWWALLET999' WHERE id = ?`, [student1Id]);
    const token = makeToken({ userId: student1Id, email: `cux-s1-${student1Id}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = (res.body.data.applications as { applicationId: string; walletAddress: string }[])
      .find((a) => a.applicationId === appId);
    expect(found).toBeDefined();
    // Application still carries the original wallet
    expect(found?.walletAddress).toBe('GCUXWALLET1');
    // User now has a different wallet (verified client-side by frontend)
  });
});
