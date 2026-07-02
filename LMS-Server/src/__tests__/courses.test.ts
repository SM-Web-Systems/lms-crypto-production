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

// ── List courses ──────────────────────────────────────────

describe('GET /api/v1/courses', () => {
  it('admin sees all courses', async () => {
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.courses).toHaveLength(2);
  });

  it('student sees only enrolled courses', async () => {
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const codes = res.body.data.courses.map((c: { courseCode: string }) => c.courseCode);
    expect(codes).toContain(ids.courseCode);
    expect(codes).not.toContain(ids.course2Code);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/courses');
    expect(res.status).toBe(401);
  });
});

// ── Get single course ─────────────────────────────────────

describe('GET /api/v1/courses/:id', () => {
  it('admin can get any course', async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ids.courseId);
    expect(res.body.data.courseCode).toBe(ids.courseCode);
    expect(res.body.data.sections).toBeInstanceOf(Array);
  });

  it('student can access enrolled course', async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.courseCode).toBe(ids.courseCode);
  });

  it('student cannot access unenrolled course', async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${ids.course2Id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent course', async () => {
    const res = await request(app)
      .get('/api/v1/courses/nonexistent-id')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

// ── Create course ─────────────────────────────────────────

describe('POST /api/v1/courses', () => {
  it('admin creates course successfully', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'New Course',
        description: 'A brand new course',
        courseCode: 'NEW-100',
        sections: [{ id: 'sec-1', title: 'Intro', items: [] }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('New Course');
    expect(res.body.data.courseCode).toBe('NEW-100');
    expect(res.body.data.sections).toHaveLength(1);
  });

  it('rejects duplicate courseCode', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Dup', courseCode: ids.courseCode, sections: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DUPLICATE_ENTRY');
  });

  it('validates required fields', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'no title or code' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain('title');
    expect(fields).toContain('courseCode');
  });

  it('student cannot create courses (403)', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Nope', courseCode: 'NOPE-1', sections: [] });

    expect(res.status).toBe(403);
  });
});

// ── Update course ─────────────────────────────────────────

describe('PUT /api/v1/courses/:id', () => {
  it('admin updates course title', async () => {
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
    expect(res.body.data.courseCode).toBe(ids.courseCode);
  });

  it('admin updates course sections', async () => {
    const newSections = [
      { id: 'sec-a', title: 'Chapter A', items: [] },
      { id: 'sec-b', title: 'Chapter B', items: [] },
    ];
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sections: newSections });

    expect(res.status).toBe(200);
    expect(res.body.data.sections).toHaveLength(2);
  });

  it('rejects update with duplicate courseCode', async () => {
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseCode: ids.course2Code });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DUPLICATE_ENTRY');
  });

  it('returns 404 for non-existent course', async () => {
    const res = await request(app)
      .put('/api/v1/courses/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'X' });

    expect(res.status).toBe(404);
  });
});

// ── Delete course ─────────────────────────────────────────

describe('DELETE /api/v1/courses/:id', () => {
  it('admin deletes course', async () => {
    const res = await request(app)
      .delete(`/api/v1/courses/${ids.course2Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await request(app)
      .get(`/api/v1/courses/${ids.course2Id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(check.status).toBe(404);
  });

  it('returns 404 for non-existent course', async () => {
    const res = await request(app)
      .delete('/api/v1/courses/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('student cannot delete courses', async () => {
    const res = await request(app)
      .delete(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});

// ── Course members ────────────────────────────────────────

describe('GET /api/v1/courses/:id/members', () => {
  it('returns members for enrolled student', async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/members`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const memberIds = res.body.data.members.map((m: { id: string }) => m.id);
    expect(memberIds).toContain(ids.studentUserId);
  });

  it('admin can view members of any course', async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${ids.course2Id}/members`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.members).toBeInstanceOf(Array);
  });

  it('student cannot view members of unenrolled course', async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${ids.course2Id}/members`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/courses/:id/members', () => {
  it('admin adds a member', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.course2Id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: ids.studentUserId });

    expect(res.status).toBe(201);
    const memberIds = res.body.data.members.map((m: { id: string }) => m.id);
    expect(memberIds).toContain(ids.studentUserId);
  });

  it('is idempotent (adding same member twice)', async () => {
    await request(app)
      .post(`/api/v1/courses/${ids.courseId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: ids.studentUserId });

    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: ids.studentUserId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('resolves student.id to user.id', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.course2Id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: ids.studentId });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it('student cannot add members', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/members`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ userId: ids.adminId });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/courses/:id/members/:userId', () => {
  it('admin removes a member', async () => {
    const res = await request(app)
      .delete(`/api/v1/courses/${ids.courseId}/members/${ids.studentUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/members`)
      .set('Authorization', `Bearer ${adminToken}`);
    const memberIds = check.body.data.members.map((m: { id: string }) => m.id);
    expect(memberIds).not.toContain(ids.studentUserId);
  });

  it('returns 404 when enrollment does not exist', async () => {
    const res = await request(app)
      .delete(`/api/v1/courses/${ids.course2Id}/members/${ids.studentUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
