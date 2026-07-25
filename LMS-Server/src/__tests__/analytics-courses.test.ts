/**
 * Tests for GET /api/v1/analytics/courses (L-011 per-course analytics).
 *
 * AC1 — 401 when no token
 * AC2 — 403 when student token
 * AC3 — 200 with empty courses array when no courses exist
 * AC4 — 200 with correct enrollment + wallet + NFT counts
 * AC5 — sponsorLabel is included when set, null when not set
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
    VALUES ('${userId}', 'AC User', 'ac-${suffix}@test.com', '${HASH}', '${role}',
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
  return credId;
}

describe('GET /api/v1/analytics/courses', () => {
  it('AC1 — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/analytics/courses');
    expect(res.status).toBe(401);
  });

  it('AC2 — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `ac-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/analytics/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('AC3 — 200 with empty courses when none exist', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ac-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/analytics/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.courses).toEqual([]);
  });

  it('AC4 — 200 with correct enrollment + wallet + NFT counts', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ac-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const code = `AC-${uuidv4().slice(0, 6).toUpperCase()}`;
    const courseId = seedCourse('Analytics Test Course', code);

    // 2 students enrolled, 1 with wallet
    const s1 = seedUser('student', uuidv4().slice(0, 8), `GWALLET${uuidv4().slice(0, 12).toUpperCase()}`);
    const s2 = seedUser('student', uuidv4().slice(0, 8));
    enrol(s1, code);
    enrol(s2, code);

    // 1 NFT issued for s1
    seedNft(courseId, s1, `GWALLET${uuidv4().slice(0, 12).toUpperCase()}`);

    const res = await request(app)
      .get('/api/v1/analytics/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const course = res.body.data.courses.find((c: { courseId: string }) => c.courseId === courseId);
    expect(course).toBeDefined();
    expect(course.enrollmentsCount).toBe(2);
    expect(course.walletsLinkedCount).toBe(1);
    expect(course.nftsIssuedCount).toBe(1);
  });

  it('AC5 — sponsorLabel present when set, null when not set', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ac-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const code1 = `ACS1-${uuidv4().slice(0, 6).toUpperCase()}`;
    const code2 = `ACS2-${uuidv4().slice(0, 6).toUpperCase()}`;
    seedCourse('Sponsored Course', code1, 'USAID Cohort 2026');
    seedCourse('Unsponsored Course', code2);

    const res = await request(app)
      .get('/api/v1/analytics/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const courses: { courseName: string; sponsorLabel: string | null }[] = res.body.data.courses;
    const sponsored = courses.find((c) => c.courseName === 'Sponsored Course');
    const unsponsored = courses.find((c) => c.courseName === 'Unsponsored Course');
    expect(sponsored?.sponsorLabel).toBe('USAID Cohort 2026');
    expect(unsponsored?.sponsorLabel).toBeNull();
  });
});
