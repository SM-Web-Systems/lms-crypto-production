/**
 * search.test.ts — Phase 26 C1
 *
 * SRCH-BE-1: GET /search?q=<term> returns matching courses
 * SRCH-BE-2: GET /search?q=<term> as admin returns users
 * SRCH-BE-3: GET /search?q=<term> as student does NOT return users
 * SRCH-BE-4: GET /search without q returns 400
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

let adminId: string;
let adminToken: string;
let studentId: string;
let studentToken: string;
let courseId: string;

function seedSearchData() {
  adminId = uuidv4();
  studentId = uuidv4();
  courseId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Search Admin', ?, ?, 'admin')`,
  ).run(adminId, `search-admin-${adminId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Alice Blockchain', ?, ?, 'student')`,
  ).run(studentId, `alice-${studentId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Blockchain Fundamentals', 'Learn blockchain basics', 'BLK-101', '[]')`,
  ).run(courseId);

  adminToken = makeToken({ userId: adminId, email: `search-admin-${adminId}@test.com`, role: 'admin' });
  studentToken = makeToken({ userId: studentId, email: `alice-${studentId}@test.com`, role: 'student' });
}

beforeEach(() => {
  seedSearchData();
});

describe('GET /api/v1/search (Phase 26 C1)', () => {
  it('SRCH-BE-1: returns matching courses', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=blockchain')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results.courses.length).toBeGreaterThan(0);
    expect(res.body.data.results.courses[0].title).toContain('Blockchain');
    expect(res.body.data.counts.courses).toBeGreaterThan(0);
  });

  it('SRCH-BE-2: admin search returns users', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=alice')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.users.length).toBeGreaterThan(0);
    expect(res.body.data.results.users[0].name).toContain('Alice');
  });

  it('SRCH-BE-3: student search does NOT return users', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=alice')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.users).toBeUndefined();
  });

  it('SRCH-BE-4: missing q returns 400', async () => {
    const res = await request(app)
      .get('/api/v1/search')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('q');
  });
});
