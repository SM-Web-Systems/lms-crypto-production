/**
 * Gaps found by the mainnet single-role test (24 Nov 2026):
 *  1. Course staff list carries approval status (for the Submit / Approve buttons).
 *  3. A lecturer can set the certificate tier on their own course while it is a draft.
 *  4. Sponsors are refused on the teacher, parent and employer APIs.
 *  5. Quizzes can only be created, moved, edited or deleted on courses the caller manages.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import './setup.js';
import app from '../app.js';
import { execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

function createUserWithRole(roleId: string, roleName: string) {
  const userId = uuidv4();
  const email = `${roleName}-${userId.slice(0, 8)}@test.com`;
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
    [userId, `Test ${roleName}`, email],
  );
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  const token = generateToken({ userId, email, role: 'student' as never });
  return { userId, email, token };
}

function createCourse(status: string, lecturerId?: string) {
  const id = uuidv4();
  execute(
    "INSERT INTO courses (id, title, course_code, sections, approval_status) VALUES (?, ?, ?, '[]', ?)",
    [id, `Course ${id.slice(0, 6)}`, `GAP-${id.slice(0, 8).toUpperCase()}`, status],
  );
  if (lecturerId) execute('INSERT INTO course_lecturers (course_id, user_id) VALUES (?, ?)', [id, lecturerId]);
  return id;
}

const QUESTIONS = [{ id: 'q1', type: 'multiple_choice', question: '1+1?', options: ['1', '2'], correctIndex: 1, order: 1 }];

describe('Gap 1: course status in the staff list, submit and approve', () => {
  it('lists approvalStatus for course staff, and the lecturer submit / admin approve flow works', async () => {
    const lecturer = createUserWithRole('role_instructor', 'instructor');
    const admin = createUserWithRole('role_admin', 'admin');
    const courseId = createCourse('draft', lecturer.userId);

    const list = await request(app).get('/api/v1/courses?access=manage').set('Authorization', `Bearer ${lecturer.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.courses.find((c: { id: string }) => c.id === courseId)?.approvalStatus).toBe('draft');

    expect((await request(app).post(`/api/v1/courses/${courseId}/approve`).set('Authorization', `Bearer ${lecturer.token}`)).status).toBe(403);
    expect((await request(app).post(`/api/v1/courses/${courseId}/submit-for-approval`).set('Authorization', `Bearer ${lecturer.token}`)).status).toBe(200);
    expect((await request(app).post(`/api/v1/courses/${courseId}/approve`).set('Authorization', `Bearer ${admin.token}`)).status).toBe(200);

    const after = await request(app).get('/api/v1/courses?access=manage').set('Authorization', `Bearer ${admin.token}`);
    expect(after.body.data.courses.find((c: { id: string }) => c.id === courseId)?.approvalStatus).toBe('approved');
  });

  it('does not expose approvalStatus in the learner list', async () => {
    const admin = createUserWithRole('role_admin', 'admin');
    createCourse('published');
    const res = await request(app).get('/api/v1/courses').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    for (const c of res.body.data.courses) expect(c).not.toHaveProperty('approvalStatus');
  });
});

describe('Gap 3: certificate tier from the course editor', () => {
  let lecturer: ReturnType<typeof createUserWithRole>;
  let admin: ReturnType<typeof createUserWithRole>;
  beforeEach(() => {
    lecturer = createUserWithRole('role_instructor', 'instructor');
    admin = createUserWithRole('role_admin', 'admin');
  });

  it('lets the lecturer set the tier on their own draft, at price 0', async () => {
    const courseId = createCourse('draft', lecturer.userId);
    const res = await request(app).put(`/api/v1/courses/${courseId}/certificate-tiers`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({ tiersEnabled: 'free_only' });
    expect(res.status).toBe(200);
    expect(res.body.data.tiersEnabled).toBe('free_only');
    const row = queryOne<{ price_cents: number; tiers_enabled: string }>('SELECT price_cents, tiers_enabled FROM course_pricing WHERE course_id = ?', [courseId]);
    expect(row).toEqual({ price_cents: 0, tiers_enabled: 'free_only' });

    const tiers = await request(app).get(`/api/v1/courses/${courseId}/tiers`).set('Authorization', `Bearer ${lecturer.token}`);
    expect(tiers.body.data.tiersEnabled).toBe('free_only');
  });

  it('keeps an existing price when the tier changes', async () => {
    const courseId = createCourse('draft', lecturer.userId);
    execute("INSERT INTO course_pricing (id, course_id, price_cents, currency) VALUES (?, ?, 500, 'USD')", [uuidv4(), courseId]);
    await request(app).put(`/api/v1/courses/${courseId}/certificate-tiers`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({ tiersEnabled: 'paid_only' }).expect(200);
    expect(queryOne<{ price_cents: number }>('SELECT price_cents FROM course_pricing WHERE course_id = ?', [courseId])?.price_cents).toBe(500);
  });

  it('locks the tier for the lecturer once submitted, but not for an admin', async () => {
    const courseId = createCourse('submitted', lecturer.userId);
    const locked = await request(app).put(`/api/v1/courses/${courseId}/certificate-tiers`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({ tiersEnabled: 'both' });
    expect(locked.status).toBe(403);
    const ok = await request(app).put(`/api/v1/courses/${courseId}/certificate-tiers`)
      .set('Authorization', `Bearer ${admin.token}`).send({ tiersEnabled: 'both' });
    expect(ok.status).toBe(200);
  });

  it("refuses another lecturer's course and a bad value", async () => {
    const other = createUserWithRole('role_instructor', 'instructor2');
    const courseId = createCourse('draft', other.userId);
    expect((await request(app).put(`/api/v1/courses/${courseId}/certificate-tiers`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({ tiersEnabled: 'free_only' })).status).toBe(403);
    const own = createCourse('draft', lecturer.userId);
    expect((await request(app).put(`/api/v1/courses/${own}/certificate-tiers`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({ tiersEnabled: 'gold' })).status).toBe(400);
  });
});

describe('Gap 4: sponsors refused on teacher, parent and employer APIs', () => {
  const routes = ['/api/v1/teacher/dashboard', '/api/v1/teacher/rewards', '/api/v1/parent/dashboard', '/api/v1/parent/children',
    '/api/v1/parent/children/invitations', '/api/v1/parent/rewards', '/api/v1/employer/dashboard', '/api/v1/employer/rewards'];

  it.each(routes)('sponsor gets 403 on %s', async (route) => {
    const sponsor = createUserWithRole('role_sponsor', 'sponsor');
    const res = await request(app).get(route).set('Authorization', `Bearer ${sponsor.token}`);
    expect(res.status).toBe(403);
  });

  it('sponsor still reaches their own dashboard', async () => {
    const sponsor = createUserWithRole('role_sponsor', 'sponsor');
    const res = await request(app).get('/api/v1/sponsor/dashboard').set('Authorization', `Bearer ${sponsor.token}`);
    expect(res.status).not.toBe(403);
  });

  it.each([
    ['role_teacher', 'teacher', '/api/v1/teacher/dashboard'],
    ['role_parent', 'parent', '/api/v1/parent/dashboard'],
    ['role_employer', 'employer', '/api/v1/employer/dashboard'],
  ])('%s still reaches %s', async (roleId, name, route) => {
    const user = createUserWithRole(roleId, name);
    expect((await request(app).get(route).set('Authorization', `Bearer ${user.token}`)).status).toBe(200);
  });

  it('a teacher cannot use the parent API', async () => {
    const teacher = createUserWithRole('role_teacher', 'teacher');
    expect((await request(app).get('/api/v1/parent/dashboard').set('Authorization', `Bearer ${teacher.token}`)).status).toBe(403);
  });

  it('unauthenticated stays 401', async () => {
    expect((await request(app).get('/api/v1/teacher/dashboard')).status).toBe(401);
  });
});

describe("Gap 5: quizzes only on courses you manage", () => {
  let lecturer: ReturnType<typeof createUserWithRole>;
  let other: ReturnType<typeof createUserWithRole>;
  let admin: ReturnType<typeof createUserWithRole>;
  let ownCourse: string;
  let otherCourse: string;
  beforeEach(() => {
    lecturer = createUserWithRole('role_instructor', 'instructor');
    other = createUserWithRole('role_instructor', 'instructor-other');
    admin = createUserWithRole('role_admin', 'admin');
    ownCourse = createCourse('draft', lecturer.userId);
    otherCourse = createCourse('approved', other.userId);
  });
  const create = (token: string, courseId?: string) => request(app).post('/api/v1/quizzes')
    .set('Authorization', `Bearer ${token}`).send({ title: 'Q', questions: QUESTIONS, ...(courseId ? { courseId } : {}) });

  it('lecturer creates a quiz on their own course', async () => {
    const res = await create(lecturer.token, ownCourse);
    expect(res.status).toBe(201);
    expect(res.body.data.courseId).toBe(ownCourse);
  });

  it("lecturer cannot attach a quiz to someone else's course, or create a course-less quiz", async () => {
    expect((await create(lecturer.token, otherCourse)).status).toBe(403);
    expect((await create(lecturer.token)).status).toBe(403);
    expect(queryOne('SELECT id FROM quizzes WHERE course_id = ?', [otherCourse])).toBeFalsy();
  });

  it("lecturer cannot move their quiz onto someone else's course, or edit / delete another lecturer's quiz", async () => {
    const mine = (await create(lecturer.token, ownCourse)).body.data.id as string;
    const theirs = (await create(other.token, otherCourse)).body.data.id as string;
    expect((await request(app).put(`/api/v1/quizzes/${mine}`).set('Authorization', `Bearer ${lecturer.token}`).send({ courseId: otherCourse })).status).toBe(403);
    expect((await request(app).put(`/api/v1/quizzes/${theirs}`).set('Authorization', `Bearer ${lecturer.token}`).send({ title: 'Hijacked' })).status).toBe(403);
    expect((await request(app).delete(`/api/v1/quizzes/${theirs}`).set('Authorization', `Bearer ${lecturer.token}`)).status).toBe(403);
    expect(queryOne<{ title: string; course_id: string }>('SELECT title, course_id FROM quizzes WHERE id = ?', [theirs])).toEqual({ title: 'Q', course_id: otherCourse });
    expect(queryOne<{ course_id: string }>('SELECT course_id FROM quizzes WHERE id = ?', [mine])?.course_id).toBe(ownCourse);
    // Own quiz edits still work.
    expect((await request(app).put(`/api/v1/quizzes/${mine}`).set('Authorization', `Bearer ${lecturer.token}`).send({ title: 'Renamed' })).status).toBe(200);
    expect((await request(app).delete(`/api/v1/quizzes/${mine}`).set('Authorization', `Bearer ${lecturer.token}`)).status).toBe(200);
  });

  it('admin can still manage any quiz, including course-less ones', async () => {
    expect((await create(admin.token)).status).toBe(201);
    const theirs = (await create(other.token, otherCourse)).body.data.id as string;
    expect((await request(app).put(`/api/v1/quizzes/${theirs}`).set('Authorization', `Bearer ${admin.token}`).send({ courseId: ownCourse })).status).toBe(200);
  });
});
