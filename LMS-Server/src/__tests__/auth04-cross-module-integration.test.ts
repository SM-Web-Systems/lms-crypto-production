/**
 * AUTH-04: Cross-Module Sponsor Authorization Integration Tests
 *
 * Verifies AUTH-02 (billing scoping) and AUTH-03 (cohort ownership) work
 * correctly together. Tests the complete sponsor authorization lifecycle
 * across both payments and cohorts modules.
 *
 * AUTH04-01  Sponsor creates and accesses authorized cohort
 * AUTH04-02  Sponsor manages permitted cohort memberships
 * AUTH04-03  Sponsor views authorized cohort billing (list + spending-report)
 * AUTH04-04  Sponsor accesses authorized receipts and badges
 * AUTH04-05  Sponsor denied access to another sponsor's cohort
 * AUTH04-06  Sponsor denied access to another sponsor's exclusive payments
 * AUTH04-07  Sponsor denied unauthorized receipt and badge access
 * AUTH04-08  Sponsor cannot initiate payment for another sponsor's cohort
 * AUTH04-09  Sponsor with no cohorts receives no unauthorized data
 * AUTH04-10  Shared student across cohorts cannot cause unintended exposure
 * AUTH04-11  Admin retains cross-cohort billing and cohort access
 * AUTH04-12  Student retains self-service payment access
 * AUTH04-13  Missing permissions fail closed
 * AUTH04-14  Record counts and filtering remain correctly scoped
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, execute, queryOne } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

// ─── Seed Helpers ───────────────────────────────────────────────────────────

function seedUser(legacyRole: 'admin' | 'student', suffix: string): { userId: string; email: string } {
  const userId = uuidv4();
  const email = `auth04-${suffix}-${Date.now()}@test.com`;
  db.exec(`
    INSERT INTO users (id,name,email,password_hash,walletAddress,wallet_linking_status)
    VALUES ('${userId}','User ${suffix}','${email}','${HASH}',NULL,'none');
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

function seedCohort(name: string, sponsorUserId: string, courseId: string, tier = 'paid'): string {
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

function seedPayment(userId: string, courseId: string, status = 'confirmed'): string {
  const paymentId = uuidv4();
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
    VALUES ('${paymentId}', '${userId}', '${courseId}', NULL, 5000, 'USD', 'manual', '${status}', datetime('now'), datetime('now'));
  `);
  return paymentId;
}

function seedNftApplication(userId: string, courseId: string): string {
  const appId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, applied_at)
    VALUES ('${appId}', '${userId}', '${courseId}', '0xFAKE', 'minted', datetime('now'));
  `);
  return appId;
}

function seedBadge(userId: string, courseId: string): string {
  const badgeId = uuidv4();
  const appId = seedNftApplication(userId, courseId);
  db.exec(`
    INSERT INTO certificate_badges (id, user_id, course_id, application_id, badge_svg, badge_hash)
    VALUES ('${badgeId}', '${userId}', '${courseId}', '${appId}', '<svg></svg>', 'hash-${badgeId.slice(0, 8)}');
  `);
  return badgeId;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AUTH-04: Cross-Module Sponsor Authorization', () => {
  let sponsorA: { userId: string; email: string };
  let sponsorB: { userId: string; email: string };
  let sponsorC: { userId: string; email: string }; // no cohorts
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let adminUser: { userId: string; email: string };
  let adminToken: string;

  let courseId: string;
  const courseCode = 'AUTH04-C1';
  let course2Id: string;
  const course2Code = 'AUTH04-C2';

  let cohortA: string;
  let cohortB: string;

  let studentA1: { userId: string; email: string };
  let studentA2: { userId: string; email: string };
  let studentB1: { userId: string; email: string };
  let sharedStudent: { userId: string; email: string }; // in both cohorts

  // Payments and badges
  let paymentA1: string; // studentA1's payment (course A)
  let paymentB1: string; // studentB1's payment (course A)
  let paymentSharedA: string; // shared student payment via cohort A context
  let badgeA1: string; // studentA1's badge
  let badgeB1: string; // studentB1's badge

  beforeEach(() => {
    // Sponsors
    sponsorA = seedUser('student', 'sp-a');
    assignSponsorRole(sponsorA.userId);
    tokenA = makeToken({ userId: sponsorA.userId, email: sponsorA.email, role: 'student' });

    sponsorB = seedUser('student', 'sp-b');
    assignSponsorRole(sponsorB.userId);
    tokenB = makeToken({ userId: sponsorB.userId, email: sponsorB.email, role: 'student' });

    sponsorC = seedUser('student', 'sp-c');
    assignSponsorRole(sponsorC.userId);
    tokenC = makeToken({ userId: sponsorC.userId, email: sponsorC.email, role: 'student' });

    // Admin
    adminUser = seedUser('admin', 'adm');
    adminToken = makeToken({ userId: adminUser.userId, email: adminUser.email, role: 'admin' });

    // Courses
    courseId = seedCourse('Auth04 Course 1', courseCode);
    seedPricing(courseId, 5000);
    course2Id = seedCourse('Auth04 Course 2', course2Code);
    seedPricing(course2Id, 3000);

    // Students
    studentA1 = seedUser('student', 'sa1');
    studentA2 = seedUser('student', 'sa2');
    studentB1 = seedUser('student', 'sb1');
    sharedStudent = seedUser('student', 'shared');

    // Cohorts
    cohortA = seedCohort('Cohort Alpha', sponsorA.userId, courseId);
    cohortB = seedCohort('Cohort Beta', sponsorB.userId, courseId);

    // Members — shared student is in BOTH cohorts
    seedCohortMember(cohortA, studentA1.userId);
    seedCohortMember(cohortA, studentA2.userId);
    seedCohortMember(cohortA, sharedStudent.userId);
    seedCohortMember(cohortB, studentB1.userId);
    seedCohortMember(cohortB, sharedStudent.userId);

    // Enrollments
    seedEnrollment(studentA1.userId, courseCode);
    seedEnrollment(studentA2.userId, courseCode);
    seedEnrollment(studentB1.userId, courseCode);
    seedEnrollment(sharedStudent.userId, courseCode);

    // Payments
    paymentA1 = seedPayment(studentA1.userId, courseId);
    paymentB1 = seedPayment(studentB1.userId, courseId);
    paymentSharedA = seedPayment(sharedStudent.userId, courseId);

    // Badges
    badgeA1 = seedBadge(studentA1.userId, courseId);
    badgeB1 = seedBadge(studentB1.userId, courseId);
  });

  // ─── AUTH04-01: Sponsor creates and accesses authorized cohort ─────
  it('AUTH04-01: Sponsor A can create cohort and view it', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'New Cohort', courseId, selectedTier: 'free' });
    expect(createRes.status).toBe(201);
    const newCohortId = createRes.body.data.cohortId;

    const detailRes = await request(app)
      .get(`/api/v1/admin/cohorts/${newCohortId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.cohort.cohortId).toBe(newCohortId);
  });

  // ─── AUTH04-02: Sponsor manages permitted cohort memberships ───────
  it('AUTH04-02: Sponsor A manages own cohort members', async () => {
    const newStudent = seedUser('student', 'new-add');
    const addRes = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortA}/members`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ userIds: [newStudent.userId] });
    expect(addRes.status).toBe(200);
    expect(addRes.body.data.added).toBe(1);

    const removeRes = await request(app)
      .delete(`/api/v1/admin/cohorts/${cohortA}/members/${newStudent.userId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(removeRes.status).toBe(200);
  });

  // ─── AUTH04-03: Sponsor views authorized cohort billing ────────────
  it('AUTH04-03: Sponsor A sees only own cohort payments and spending', async () => {
    // Cohort list scoped
    const listRes = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    const cohortIds = listRes.body.data.cohorts.map((c: any) => c.cohortId);
    expect(cohortIds).toContain(cohortA);
    expect(cohortIds).not.toContain(cohortB);

    // Spending report scoped
    const spendRes = await request(app)
      .get('/api/v1/admin/cohorts/spending-report')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(spendRes.status).toBe(200);
    const spendCohortIds = spendRes.body.data.cohorts.map((c: any) => c.cohortId);
    expect(spendCohortIds).toContain(cohortA);
    expect(spendCohortIds).not.toContain(cohortB);

    // Payment list scoped (AUTH-02)
    const payRes = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(payRes.status).toBe(200);
    // Sponsor A should see payments for their cohort members
    const payIds = payRes.body.data.payments.map((p: any) => p.paymentId);
    expect(payIds).toContain(paymentA1);
    expect(payIds).not.toContain(paymentB1);
  });

  // ─── AUTH04-04: Sponsor accesses authorized receipts/badges ────────
  it('AUTH04-04: Sponsor A can access own cohort member badge', async () => {
    const res = await request(app)
      .get(`/api/v1/badges/${badgeA1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
  });

  // ─── AUTH04-05: Sponsor denied another sponsor's cohort ────────────
  it('AUTH04-05: Sponsor A denied Sponsor B cohort across all endpoints', async () => {
    const endpoints = [
      { method: 'get', path: `/api/v1/admin/cohorts/${cohortB}` },
      { method: 'post', path: `/api/v1/admin/cohorts/${cohortB}/members`, body: { userIds: ['fake'] } },
      { method: 'post', path: `/api/v1/admin/cohorts/${cohortB}/apply` },
      { method: 'post', path: `/api/v1/admin/cohorts/${cohortB}/pay` },
      { method: 'patch', path: `/api/v1/admin/cohorts/${cohortB}/status`, body: { status: 'active' } },
      { method: 'get', path: `/api/v1/admin/cohorts/${cohortB}/status-log` },
      { method: 'post', path: `/api/v1/admin/cohorts/${cohortB}/invite`, body: { emails: ['x@x.com'] } },
      { method: 'post', path: `/api/v1/admin/cohorts/${cohortB}/send-reminder` },
    ];
    for (const ep of endpoints) {
      const r = (request(app) as any)[ep.method](ep.path).set('Authorization', `Bearer ${tokenA}`);
      if ((ep as any).body) r.send((ep as any).body);
      const res = await r;
      expect(res.status).toBe(403);
    }
  });

  // ─── AUTH04-06: Sponsor denied another sponsor's payments ──────────
  it('AUTH04-06: Sponsor A cannot view Sponsor B member payment status', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${paymentB1}/status`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  // ─── AUTH04-07: Sponsor denied unauthorized badge access ───────────
  it('AUTH04-07: Sponsor A cannot view Sponsor B member badge', async () => {
    const res = await request(app)
      .get(`/api/v1/badges/${badgeB1}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  // ─── AUTH04-08: Sponsor cannot pay for another sponsor's cohort ────
  it('AUTH04-08: Sponsor A cannot initiate payment on Sponsor B cohort', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortB}/pay`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });

  // ─── AUTH04-09: Sponsor with no cohorts gets empty data ────────────
  it('AUTH04-09: Sponsor C with no cohorts receives empty lists', async () => {
    const cohortList = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${tokenC}`);
    expect(cohortList.status).toBe(200);
    expect(cohortList.body.data.cohorts).toHaveLength(0);
    expect(cohortList.body.data.total).toBe(0);

    const spendReport = await request(app)
      .get('/api/v1/admin/cohorts/spending-report')
      .set('Authorization', `Bearer ${tokenC}`);
    expect(spendReport.status).toBe(200);
    expect(spendReport.body.data.cohorts).toHaveLength(0);

    const payList = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${tokenC}`);
    expect(payList.status).toBe(200);
    expect(payList.body.data.payments).toHaveLength(0);
  });

  // ─── AUTH04-10: Shared student doesn't cause cross-sponsor leakage ─
  it('AUTH04-10: Shared student in both cohorts does not leak data cross-sponsor', async () => {
    // Sponsor A should see shared student's payment (same course context, student in sponsor A's cohort)
    const resA = await request(app)
      .get(`/api/v1/payments/${paymentSharedA}/status`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.status).toBe(200);

    // Sponsor B should also see shared student's payment (student is also in B's cohort, same course)
    const resB = await request(app)
      .get(`/api/v1/payments/${paymentSharedA}/status`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(200);

    // Sponsor A's exclusive student's payment should NOT be visible to Sponsor B
    const resCross = await request(app)
      .get(`/api/v1/payments/${paymentA1}/status`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resCross.status).toBe(403);
  });

  // ─── AUTH04-11: Admin retains full cross-cohort access ─────────────
  it('AUTH04-11: Admin sees all cohorts and all payments', async () => {
    // Admin sees all cohorts
    const cohortList = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cohortList.status).toBe(200);
    const ids = cohortList.body.data.cohorts.map((c: any) => c.cohortId);
    expect(ids).toContain(cohortA);
    expect(ids).toContain(cohortB);

    // Admin sees all payments
    const payList = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(payList.status).toBe(200);
    const payIds = payList.body.data.payments.map((p: any) => p.paymentId);
    expect(payIds).toContain(paymentA1);
    expect(payIds).toContain(paymentB1);

    // Admin can view any badge
    const badge = await request(app)
      .get(`/api/v1/badges/${badgeB1}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(badge.status).toBe(200);
  });

  // ─── AUTH04-12: Student retains self-service access ────────────────
  it('AUTH04-12: Student can view own payment', async () => {
    const studentToken = makeToken({ userId: studentA1.userId, email: studentA1.email, role: 'student' });
    const res = await request(app)
      .get(`/api/v1/payments/${paymentA1}/status`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
  });

  // ─── AUTH04-13: Missing permissions fail closed ────────────────────
  it('AUTH04-13: User without billing.view_all or cohort.manage gets 403', async () => {
    const plainStudent = seedUser('student', 'plain');
    const plainToken = makeToken({ userId: plainStudent.userId, email: plainStudent.email, role: 'student' });

    const cohortRes = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(cohortRes.status).toBe(403);

    const payRes = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(payRes.status).toBe(403);
  });

  // ─── AUTH04-14: Record counts and courseId filtering remain scoped ──
  it('AUTH04-14: courseId filter on cohort list still respects ownership', async () => {
    // Create cohort on course2 for sponsor A
    const cohortA2 = seedCohort('Cohort A Course2', sponsorA.userId, course2Id);

    // Sponsor A filters by courseId — should see only own cohorts matching
    const res = await request(app)
      .get(`/api/v1/admin/cohorts?courseId=${courseId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const cohortIds = res.body.data.cohorts.map((c: any) => c.cohortId);
    expect(cohortIds).toContain(cohortA);
    expect(cohortIds).not.toContain(cohortB); // B's cohort on same course — filtered out
    expect(cohortIds).not.toContain(cohortA2); // A's cohort on different course — filtered out by courseId

    // Sponsor A can see course2 cohort when filtering by course2
    const res2 = await request(app)
      .get(`/api/v1/admin/cohorts?courseId=${course2Id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res2.status).toBe(200);
    expect(res2.body.data.cohorts.map((c: any) => c.cohortId)).toContain(cohortA2);
  });
});
