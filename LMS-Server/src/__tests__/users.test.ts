import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { seedTestData, type TestIds } from './helpers/seed.js';
import { makeToken } from './helpers/auth.js';

let ids: TestIds;
let adminToken: string;
let studentToken: string;

beforeEach(() => {
  ids = seedTestData();
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
  studentToken = makeToken({
    userId: ids.studentUserId,
    email: 'student@test.com',
    role: 'student',
    studentId: ids.studentId,
  });
});

// ── My courses ────────────────────────────────────────────

describe('GET /api/v1/users/me/courses', () => {
  it('returns course IDs the student is enrolled in', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/courses')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.courseIds).toContain(ids.courseId);
    expect(res.body.data.courseIds).not.toContain(ids.course2Id);
  });

  it('admin with no course codes gets empty array', async () => {
    const res = await request(app)
      .get('/api/v1/users/me/courses')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.courseIds).toEqual([]);
  });
});

// ── User directory (admin only) ───────────────────────────

describe('GET /api/v1/users', () => {
  it('admin gets all users with courseCodes', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(2);

    const student = res.body.data.users.find((u: { id: string }) => u.id === ids.studentUserId);
    expect(student).toBeDefined();
    expect(student.courseCodes).toContain(ids.courseCode);
  });

  it('student gets 403', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});

// ── Patch user course codes ───────────────────────────────

describe('PATCH /api/v1/users/:id', () => {
  it('admin sets course codes for a user', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCodes: [ids.courseCode, ids.course2Code] });

    expect(res.status).toBe(200);
    expect(res.body.data.courseCodes).toHaveLength(2);
    expect(res.body.data.courseCodes).toContain(ids.courseCode);
    expect(res.body.data.courseCodes).toContain(ids.course2Code);
  });

  it('admin can clear all course codes', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCodes: [] });

    expect(res.status).toBe(200);
    expect(res.body.data.courseCodes).toEqual([]);
  });

  it('returns current codes when no courseCodes sent', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.courseCodes).toContain(ids.courseCode);
  });

  it('rejects non-existent course code', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCodes: ['FAKE-999'] });

    expect(res.status).toBe(400);
  });

  it('resolves student.id to user.id', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCodes: [ids.courseCode] });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ids.studentUserId);
  });

  it('returns 404 for unknown user', async () => {
    const res = await request(app)
      .patch('/api/v1/users/nonexistent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCodes: [] });

    expect(res.status).toBe(404);
  });

  it('student cannot patch users', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentUserId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ courseCodes: [] });

    expect(res.status).toBe(403);
  });
});
