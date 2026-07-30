/**
 * Regression tests — NFT audit, explicit approval, and issued-credentials reporting.
 *
 * Covers the 2026-07-20 NFT audit work:
 *   NA1 — Admin GET /admin/issued-credentials returns all nft_credentials rows
 *   NA2 — Student GET /admin/issued-credentials → 403
 *   NA3 — Lecturer GET /admin/issued-credentials scoped to their courses only
 *   NA4 — Quiz submit with NFT_AUTO_MINT_ENABLED=false does NOT trigger mintCredentialForQuiz
 *   NA5 — Legacy credentials (quiz_id SET, application_id=NULL) are visible in issued-credentials
 *   NA6 — course_application credentials (application_id SET) are visible in issued-credentials
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedAuditBase() {
  const adminId    = uuidv4();
  const studentId  = uuidv4();
  const lecturerId = uuidv4();
  const courseId   = uuidv4();
  const courseId2  = uuidv4(); // a different course not assigned to the lecturer
  const code       = `AUD-${uuidv4().slice(0, 8)}`;
  const code2      = `AUD-${uuidv4().slice(0, 8)}`;

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${adminId}', 'Audit Admin', 'admin-aud-${adminId}@test.com', '${HASH}', 'admin');

    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${studentId}', 'Audit Student', 'student-aud-${studentId}@test.com', '${HASH}', 'student');

    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${lecturerId}', 'Audit Lecturer', 'lecturer-aud-${lecturerId}@test.com', '${HASH}', 'lecturer');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Audit Course 1', 'Test', '${code}', '[]');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId2}', 'Audit Course 2', 'Test', '${code2}', '[]');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentId}', '${code}');

    INSERT INTO course_lecturers (course_id, user_id) VALUES ('${courseId}', '${lecturerId}');
  `);

  return { adminId, studentId, lecturerId, courseId, courseId2 };
}

function insertLegacyCredential(userId: string, courseId: string) {
  const credId = uuidv4();
  const quizId = uuidv4();
  const wallet = `GLEGACY${uuidv4().replace(/-/g, '').slice(0, 49)}`;
  // Must insert the quiz first — nft_credentials.quiz_id FK references quizzes(id)
  execute(
    `INSERT INTO quizzes (id, title, course_id, passing_score, questions) VALUES (?, 'Legacy Quiz', ?, 70, '[]')`,
    [quizId, courseId]
  );
  execute(
    `INSERT INTO nft_credentials
       (id, user_id, quiz_id, course_id, application_id, wallet_address, mint_status, contract_id, network)
     VALUES (?, ?, ?, ?, NULL, ?, 'minted', 'CDUMMYCONTRACT', 'public')`,
    [credId, userId, quizId, courseId, wallet]
  );
  return { credId, quizId, wallet };
}

function insertAppCredential(userId: string, courseId: string) {
  const credId = uuidv4();
  const appId  = uuidv4();
  const wallet = `GAPPCRED${uuidv4().replace(/-/g, '').slice(0, 48)}`;
  // LMS-DB-002: insert application BEFORE credential (FK on application_id now enforced)
  execute(
    `INSERT INTO course_nft_applications
       (id, user_id, course_id, wallet_address, status, applied_at)
     VALUES (?, ?, ?, ?, 'minted', datetime('now'))`,
    [appId, userId, courseId, wallet]
  );
  execute(
    `INSERT INTO nft_credentials
       (id, user_id, quiz_id, course_id, application_id, wallet_address, mint_status, contract_id, network)
     VALUES (?, ?, NULL, ?, ?, ?, 'minted', 'CDUMMYCONTRACT', 'public')`,
    [credId, userId, courseId, appId, wallet]
  );
  return { credId, appId, wallet };
}

// ─── NA1: Admin sees all issued credentials ───────────────────────────────────

describe('NA1 — GET /admin/issued-credentials (admin)', () => {
  it('returns 200 with all nft_credentials rows', async () => {
    const { adminId, studentId, courseId } = seedAuditBase();
    insertLegacyCredential(studentId, courseId);
    insertAppCredential(studentId, courseId);

    const token = makeToken({ userId: adminId, email: `admin-aud-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/admin/issued-credentials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.credentials)).toBe(true);
    // At least our 2 seeded rows
    expect(res.body.data.credentials.length).toBeGreaterThanOrEqual(2);
    expect(typeof res.body.data.total).toBe('number');
  });
});

// ─── NA2: Students cannot access issued-credentials ──────────────────────────

describe('NA2 — GET /admin/issued-credentials (student) → 403', () => {
  it('returns 403 for a student token', async () => {
    const { studentId } = seedAuditBase();
    const token = makeToken({ userId: studentId, email: `student-aud-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/admin/issued-credentials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── NA3: Lecturer sees only their courses ────────────────────────────────────

describe('NA3 — GET /admin/issued-credentials (lecturer) scoped to assigned courses', () => {
  it('returns only credentials in courses the lecturer teaches', async () => {
    const { lecturerId, studentId, courseId, courseId2 } = seedAuditBase();

    // One credential in the lecturer's course, one in a different course
    const { credId: ownCredId } = insertLegacyCredential(studentId, courseId);
    const { credId: otherCredId } = insertLegacyCredential(studentId, courseId2);

    const token = makeToken({ userId: lecturerId, email: `lecturer-aud-${lecturerId}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .get('/api/v1/admin/issued-credentials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data.credentials as { credentialId: string }[]).map((c) => c.credentialId);
    expect(ids).toContain(ownCredId);
    expect(ids).not.toContain(otherCredId);
  });

  it('returns empty array when lecturer has no assigned courses', async () => {
    const unassignedId = uuidv4();
    db.exec(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES ('${unassignedId}', 'No-course Lecturer', 'lect-none-${unassignedId}@test.com', '${HASH}', 'lecturer');
    `);
    const token = makeToken({ userId: unassignedId, email: `lect-none-${unassignedId}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .get('/api/v1/admin/issued-credentials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.credentials).toHaveLength(0);
  });
});

// ─── NA4: NFT_AUTO_MINT_ENABLED=false blocks quiz-triggered mints ─────────────

describe('NA4 — quiz submit does NOT trigger mint when NFT_AUTO_MINT_ENABLED != true', () => {
  beforeEach(() => {
    // Ensure auto-mint is off (default in test env)
    vi.stubEnv('NFT_AUTO_MINT_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 201 with score data and no nft_credentials row is inserted', async () => {
    const { studentId } = seedAuditBase();
    const quizId = uuidv4();
    const questions = JSON.stringify([{
      id: 'q1', type: 'short_answer', question: 'What is 1+1?', correctAnswer: '2', order: 0,
    }]);
    execute(
      `INSERT INTO quizzes (id, title, course_id, passing_score, questions) VALUES (?, 'Audit Quiz', NULL, 50, ?)`,
      [quizId, questions]
    );

    vi.stubEnv('NFT_TRIGGER_QUIZ_IDS', quizId); // mark as trigger quiz

    const token = makeToken({ userId: studentId, email: `student-aud-${studentId}@test.com`, role: 'student' });

    const countBefore = (db.prepare('SELECT COUNT(*) as c FROM nft_credentials').get() as { c: number }).c;

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { q1: '2' } });

    expect(res.status).toBe(201);
    expect(res.body.data.passed).toBe(true);

    // Give any fire-and-forget async work a brief tick to settle (should be no-op)
    await new Promise<void>((r) => setTimeout(r, 50));

    const countAfter = (db.prepare('SELECT COUNT(*) as c FROM nft_credentials').get() as { c: number }).c;
    expect(countAfter).toBe(countBefore); // no new row inserted
  });
});

// ─── NA5: Legacy credentials visible in issued-credentials ───────────────────

describe('NA5 — legacy quiz-triggered credentials visible in issued-credentials', () => {
  it('includes rows with quiz_id SET and application_id=NULL', async () => {
    const { adminId, studentId, courseId } = seedAuditBase();
    const { credId } = insertLegacyCredential(studentId, courseId);

    const token = makeToken({ userId: adminId, email: `admin-aud-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/admin/issued-credentials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const cred = (res.body.data.credentials as {
      credentialId: string;
      mintPath: string;
      applicationId: string | null;
    }[]).find((c) => c.credentialId === credId);

    expect(cred).toBeDefined();
    expect(cred?.mintPath).toBe('quiz_trigger');
    expect(cred?.applicationId).toBeNull();
  });
});

// ─── NA6: Application-workflow credentials visible in issued-credentials ──────

describe('NA6 — course-application credentials visible in issued-credentials', () => {
  it('includes rows with application_id SET and correct mintPath', async () => {
    const { adminId, studentId, courseId } = seedAuditBase();
    const { credId, appId } = insertAppCredential(studentId, courseId);

    const token = makeToken({ userId: adminId, email: `admin-aud-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/admin/issued-credentials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const cred = (res.body.data.credentials as {
      credentialId: string;
      mintPath: string;
      applicationId: string | null;
      applicationStatus: string | null;
    }[]).find((c) => c.credentialId === credId);

    expect(cred).toBeDefined();
    expect(cred?.mintPath).toBe('course_application');
    expect(cred?.applicationId).toBe(appId);
    expect(cred?.applicationStatus).toBe('minted');
  });
});
