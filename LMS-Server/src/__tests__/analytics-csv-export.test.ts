/**
 * Tests for GET /api/v1/analytics/courses/export
 *
 * CE1 — 401 when no token
 * CE2 — 403 when student token
 * CE3 — 200 with CSV header only when no data
 * CE4 — 200 with correct CSV rows including sponsor, student, wallet, NFT data
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
    VALUES ('${userId}', 'CE User ${suffix}', 'ce-${suffix}@test.com', '${HASH}', '${role}',
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

const CSV_HEADER = 'Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status';

describe('GET /api/v1/analytics/courses/export', () => {
  it('CE1 — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/analytics/courses/export');
    expect(res.status).toBe(401);
  });

  it('CE2 — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `ce-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/analytics/courses/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('CE3 — 200 with CSV header only when no data', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ce-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/analytics/courses/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="sponsor-analytics-\d{4}-\d{2}-\d{2}\.csv"/);

    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(CSV_HEADER);
  });

  it('CE4 — 200 with correct CSV rows', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ce-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const code = `CE4-${uuidv4().slice(0, 6).toUpperCase()}`;
    const courseId = seedCourse('CSV Test Course', code, 'USAID');

    const wallet1 = `GWALLET${uuidv4().slice(0, 12).toUpperCase()}`;
    const s1 = seedUser('student', uuidv4().slice(0, 8), wallet1);
    const s2 = seedUser('student', uuidv4().slice(0, 8));
    enrol(s1, code);
    enrol(s2, code);
    seedNft(courseId, s1, wallet1);

    const res = await request(app)
      .get('/api/v1/analytics/courses/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    // At least 2 data rows for the 2 enrolled students
    const dataLines = lines.slice(1).filter((l) => l.includes(code));
    expect(dataLines).toHaveLength(2);

    // Check that the student with wallet + NFT has correct data
    const mintedLine = dataLines.find((l) => l.includes(wallet1));
    expect(mintedLine).toBeDefined();
    expect(mintedLine).toContain('USAID');
    expect(mintedLine).toContain('CSV Test Course');
    expect(mintedLine).toContain('minted');

    // Check that the student without wallet has empty wallet and 'none' NFT status
    const noneLine = dataLines.find((l) => !l.includes(wallet1));
    expect(noneLine).toBeDefined();
    expect(noneLine).toContain('none');
  });
});
