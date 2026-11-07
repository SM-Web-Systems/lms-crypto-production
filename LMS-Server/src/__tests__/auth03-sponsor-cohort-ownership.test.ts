/**
 * AUTH-03: Sponsor Cohort Ownership Enforcement Tests
 *
 * Verifies that sponsors can only access cohorts they own (sponsor_user_id match),
 * while admins retain unrestricted access. Tests all 12 cohort endpoints.
 *
 * AUTH03-01  Sponsor A lists only own cohorts
 * AUTH03-02  Sponsor A does NOT see Sponsor B's cohorts in list
 * AUTH03-03  Sponsor A can view own cohort detail
 * AUTH03-04  Sponsor A cannot view Sponsor B's cohort detail → 403
 * AUTH03-05  Sponsor A can add members to own cohort
 * AUTH03-06  Sponsor A cannot add members to Sponsor B's cohort → 403
 * AUTH03-07  Sponsor A can remove member from own cohort
 * AUTH03-08  Sponsor A cannot remove member from Sponsor B's cohort → 403
 * AUTH03-09  Sponsor A can bulk-apply on own cohort
 * AUTH03-10  Sponsor A cannot bulk-apply on Sponsor B's cohort → 403
 * AUTH03-11  Sponsor A cannot bulk-pay on Sponsor B's cohort → 403
 * AUTH03-12  Sponsor A cannot change status of Sponsor B's cohort → 403
 * AUTH03-13  Sponsor A cannot view status-log of Sponsor B's cohort → 403
 * AUTH03-14  Sponsor A cannot invite to Sponsor B's cohort → 403
 * AUTH03-15  Sponsor A cannot send reminders for Sponsor B's cohort → 403
 * AUTH03-16  Admin retains full list access (sees all cohorts)
 * AUTH03-17  Admin can view any cohort detail
 * AUTH03-18  Admin can add members to any cohort
 * AUTH03-19  Sponsor A sees only own spending report
 * AUTH03-20  Admin sees full spending report
 * AUTH03-21  Nonexistent cohort returns 404 (not 403)
 * AUTH03-22  Unauthenticated request returns 401
 * AUTH03-23  Student without cohort.manage gets 403
 * AUTH03-24  Sponsor A can view own cohort status-log
 * AUTH03-25  Sponsor A can send invites to own cohort
 * AUTH03-26  Sponsor A can send reminders for own cohort
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

// ─── Seed Helpers ───────────────────────────────────────────────────────────

function seedUser(legacyRole: 'admin' | 'student', suffix: string): { userId: string; email: string } {
  const userId = uuidv4();
  const email = `auth03-${suffix}-${Date.now()}@test.com`;
  db.exec(`
    INSERT INTO users (id,name,email,password_hash)
    VALUES ('${userId}','User ${suffix}','${email}','${HASH}');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${userId}',CASE '${legacyRole}' WHEN 'student' THEN 'role_student' WHEN 'lecturer' THEN 'role_instructor' WHEN 'admin' THEN 'role_admin' END);

  `);
  return { userId, email };
}

function assignSponsorRole(userId: string): void {
  db.exec(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${userId}', 'role_sponsor');`);
}

function seedCourse(title: string, code: string): string {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', '${title}', '${code}', '[]');
  `);
  return courseId;
}

function seedPricing(courseId: string, priceCents: number): void {
  const pricingId = uuidv4();
  db.exec(`
    INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, tiers_enabled)
    VALUES ('${pricingId}', '${courseId}', ${priceCents}, 'USD', 1, 'both');
  `);
}

function seedCohort(name: string, sponsorUserId: string, courseId: string, tier = 'free'): string {
  const cohortId = uuidv4();
  db.exec(`
    INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, created_at)
    VALUES ('${cohortId}', '${name}', '${sponsorUserId}', '${courseId}', '${tier}', 'draft', datetime('now'));
  `);
  return cohortId;
}

function seedCohortMember(cohortId: string, userId: string): void {
  db.exec(`INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) VALUES ('${cohortId}', '${userId}', datetime('now'));`);
}

function seedEnrollment(userId: string, courseCode: string): void {
  db.exec(`INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES ('${userId}', '${courseCode}');`);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AUTH-03: Sponsor Cohort Ownership', () => {
  // Two sponsors, each with own cohort + students
  let sponsorA: { userId: string; email: string };
  let sponsorB: { userId: string; email: string };
  let tokenA: string;
  let tokenB: string;
  let adminUser: { userId: string; email: string };
  let adminToken: string;
  let studentUser: { userId: string; email: string };
  let studentToken: string;

  let courseId: string;
  const courseCode = 'AUTH03-COURSE';

  let cohortA: string; // owned by sponsor A
  let cohortB: string; // owned by sponsor B

  let studentA1: { userId: string; email: string };
  let studentA2: { userId: string; email: string };
  let studentB1: { userId: string; email: string };

  beforeEach(() => {
    // Sponsors (legacy role = 'student' + RBAC role_sponsor)
    sponsorA = seedUser('student', 'sponsorA');
    assignSponsorRole(sponsorA.userId);
    tokenA = makeToken({ userId: sponsorA.userId, email: sponsorA.email, role: 'student' });

    sponsorB = seedUser('student', 'sponsorB');
    assignSponsorRole(sponsorB.userId);
    tokenB = makeToken({ userId: sponsorB.userId, email: sponsorB.email, role: 'student' });

    // Admin (trigger auto-assigns role_admin)
    adminUser = seedUser('admin', 'admin');
    adminToken = makeToken({ userId: adminUser.userId, email: adminUser.email, role: 'admin' });

    // Plain student (no cohort.manage)
    studentUser = seedUser('student', 'plain-student');
    studentToken = makeToken({ userId: studentUser.userId, email: studentUser.email, role: 'student' });

    // Course
    courseId = seedCourse('AUTH03 Test Course', courseCode);
    seedPricing(courseId, 5000);

    // Students for cohort membership
    studentA1 = seedUser('student', 'sa1');
    studentA2 = seedUser('student', 'sa2');
    studentB1 = seedUser('student', 'sb1');

    // Cohorts
    cohortA = seedCohort('Cohort A', sponsorA.userId, courseId, 'paid');
    cohortB = seedCohort('Cohort B', sponsorB.userId, courseId, 'paid');

    // Members
    seedCohortMember(cohortA, studentA1.userId);
    seedCohortMember(cohortA, studentA2.userId);
    seedCohortMember(cohortB, studentB1.userId);

    // Enrollments (needed for bulkApply)
    seedEnrollment(studentA1.userId, courseCode);
    seedEnrollment(studentA2.userId, courseCode);
    seedEnrollment(studentB1.userId, courseCode);
  });

  // ─── List Endpoints ────────────────────────────────────────────────

  it('AUTH03-01: Sponsor A lists only own cohorts', async () => {
    const res = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const cohortIds = res.body.data.cohorts.map((c: any) => c.cohortId);
    expect(cohortIds).toContain(cohortA);
    expect(cohortIds).not.toContain(cohortB);
    expect(res.body.data.total).toBe(1);
  });

  it('AUTH03-02: Sponsor A does NOT see Sponsor B cohorts in list', async () => {
    const res = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const names = res.body.data.cohorts.map((c: any) => c.name);
    expect(names).not.toContain('Cohort B');
  });

  // ─── Single-Resource Read Endpoints ────────────────────────────────

  it('AUTH03-03: Sponsor A can view own cohort detail', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortA}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cohort.cohortId).toBe(cohortA);
  });

  it('AUTH03-04: Sponsor A cannot view Sponsor B cohort detail → 403', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortB}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ─── Member Management ─────────────────────────────────────────────

  it('AUTH03-05: Sponsor A can add members to own cohort', async () => {
    const newStudent = seedUser('student', 'new-member');
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortA}/members`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ userIds: [newStudent.userId] });

    expect(res.status).toBe(200);
    expect(res.body.data.added).toBe(1);
  });

  it('AUTH03-06: Sponsor A cannot add members to Sponsor B cohort → 403', async () => {
    const newStudent = seedUser('student', 'blocked-member');
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortB}/members`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ userIds: [newStudent.userId] });

    expect(res.status).toBe(403);
  });

  it('AUTH03-07: Sponsor A can remove member from own cohort', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/cohorts/${cohortA}/members/${studentA1.userId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });

  it('AUTH03-08: Sponsor A cannot remove member from Sponsor B cohort → 403', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/cohorts/${cohortB}/members/${studentB1.userId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
  });

  // ─── Bulk Operations ──────────────────────────────────────────────

  it('AUTH03-09: Sponsor A can bulk-apply on own cohort', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortA}/apply`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBeGreaterThanOrEqual(0);
  });

  it('AUTH03-10: Sponsor A cannot bulk-apply on Sponsor B cohort → 403', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortB}/apply`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
  });

  it('AUTH03-11: Sponsor A cannot bulk-pay on Sponsor B cohort → 403', async () => {
    // First apply on cohort B so it has applied members (using B's token)
    await request(app)
      .post(`/api/v1/admin/cohorts/${cohortB}/apply`)
      .set('Authorization', `Bearer ${tokenB}`);

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortB}/pay`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
  });

  // ─── Status Management ────────────────────────────────────────────

  it('AUTH03-12: Sponsor A cannot change status of Sponsor B cohort → 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/cohorts/${cohortB}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'active' });

    expect(res.status).toBe(403);
  });

  it('AUTH03-13: Sponsor A cannot view status-log of Sponsor B cohort → 403', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortB}/status-log`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
  });

  // ─── Communication ────────────────────────────────────────────────

  it('AUTH03-14: Sponsor A cannot invite to Sponsor B cohort → 403', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortB}/invite`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ emails: ['invited@test.com'] });

    expect(res.status).toBe(403);
  });

  it('AUTH03-15: Sponsor A cannot send reminders for Sponsor B cohort → 403', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortB}/send-reminder`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
  });

  // ─── Admin Bypass ─────────────────────────────────────────────────

  it('AUTH03-16: Admin sees all cohorts in list', async () => {
    const res = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const cohortIds = res.body.data.cohorts.map((c: any) => c.cohortId);
    expect(cohortIds).toContain(cohortA);
    expect(cohortIds).toContain(cohortB);
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
  });

  it('AUTH03-17: Admin can view any cohort detail', async () => {
    const resA = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortA}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resA.status).toBe(200);

    const resB = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortB}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resB.status).toBe(200);
  });

  it('AUTH03-18: Admin can add members to any cohort', async () => {
    const newStudent = seedUser('student', 'admin-add');
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortB}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [newStudent.userId] });

    expect(res.status).toBe(200);
    expect(res.body.data.added).toBe(1);
  });

  // ─── Spending Report ──────────────────────────────────────────────

  it('AUTH03-19: Sponsor A sees only own spending report', async () => {
    const res = await request(app)
      .get('/api/v1/admin/cohorts/spending-report')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const cohortIds = res.body.data.cohorts.map((c: any) => c.cohortId);
    expect(cohortIds).toContain(cohortA);
    expect(cohortIds).not.toContain(cohortB);
  });

  it('AUTH03-20: Admin sees full spending report', async () => {
    const res = await request(app)
      .get('/api/v1/admin/cohorts/spending-report')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const cohortIds = res.body.data.cohorts.map((c: any) => c.cohortId);
    expect(cohortIds).toContain(cohortA);
    expect(cohortIds).toContain(cohortB);
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  it('AUTH03-21: Nonexistent cohort returns 404 (not 403)', async () => {
    const fakeId = uuidv4();
    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${fakeId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('AUTH03-22: Unauthenticated request returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/admin/cohorts');

    expect(res.status).toBe(401);
  });

  it('AUTH03-23: Student without cohort.manage gets 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  // ─── Sponsor Positive Ownership (non-read) ────────────────────────

  it('AUTH03-24: Sponsor A can view own cohort status-log', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortA}/status-log`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('AUTH03-25: Sponsor A can send invites to own cohort', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortA}/invite`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ emails: ['newstudent@test.com'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('AUTH03-26: Sponsor A can send reminders for own cohort', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortA}/send-reminder`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
