/**
 * Tests for GET /api/v1/analytics/courses/:courseId/students
 *
 * SS1 — 401 when no token
 * SS2 — 403 when student token
 * SS3 — 404 when course does not exist
 * SS4 — 200 with empty students when no enrollments
 * SS5 — 200 with correct student data including wallet and NFT status
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string, wallet?: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'SS User ${suffix}', 'ss-${suffix}@test.com', '${HASH}', '${role}',
            ${wallet ? `'${wallet}'` : 'NULL'}, '${wallet ? 'linked' : 'none'}');
  `);
  return userId;
}

function seedCourse(title: string, code: string, sponsorLabel?: string) {
  const courseId = uuidv4();
  const sl = sponsorLabel ? `'${sponsorLabel}'` : 'NULL';
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections, sponsor_label)
    VALUES ('${courseId}', '${title}', '${code}', '[]', ${sl});
  `);
  return courseId;
}

function enrol(userId: string, courseCode: string) {
  db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', '${courseCode}');`);
}

function seedNft(courseId: string, userId: string, wallet: string) {
  const credId = uuidv4();
  db.exec(`
    INSERT INTO nft_credentials (id, user_id, wallet_address, course_id, contract_id, network)
    VALUES ('${credId}', '${userId}', '${wallet}', '${courseId}', 'CONTRACT', 'public');
  `);
}

describe('GET /api/v1/analytics/courses/:courseId/students', () => {
  it('SS1 — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/analytics/courses/fake-id/students');
    expect(res.status).toBe(401);
  });

  it('SS2 — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `ss-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/analytics/courses/fake-id/students')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('SS3 — 404 when course does not exist', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ss-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/analytics/courses/${uuidv4()}/students`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('SS4 — 200 with empty students when no enrollments', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ss-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const code = `SS4-${uuidv4().slice(0, 6).toUpperCase()}`;
    const courseId = seedCourse('Empty Course', code);

    const res = await request(app)
      .get(`/api/v1/analytics/courses/${courseId}/students`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.students).toEqual([]);
  });

  it('SS5 — 200 with correct student data including wallet and NFT status', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ss-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const code = `SS5-${uuidv4().slice(0, 6).toUpperCase()}`;
    const courseId = seedCourse('Full Course', code, 'Test Sponsor');

    const wallet1 = `GWALLET${uuidv4().slice(0, 12).toUpperCase()}`;
    const s1 = seedUser('student', uuidv4().slice(0, 8), wallet1);
    const s2 = seedUser('student', uuidv4().slice(0, 8));
    enrol(s1, code);
    enrol(s2, code);
    seedNft(courseId, s1, wallet1);

    const res = await request(app)
      .get(`/api/v1/analytics/courses/${courseId}/students`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(2);

    const withWallet = res.body.data.students.find(
      (s: { walletAddress: string | null }) => s.walletAddress !== null,
    );
    const noWallet = res.body.data.students.find(
      (s: { walletAddress: string | null }) => s.walletAddress === null,
    );
    expect(withWallet).toBeDefined();
    expect(withWallet.nftStatus).toBe('minted');
    expect(withWallet.walletAddress).toBe(wallet1);
    expect(withWallet.enrolledAt).toBeDefined();

    expect(noWallet).toBeDefined();
    expect(noWallet.nftStatus).toBe('none');
    expect(noWallet.walletAddress).toBeNull();
  });
});
