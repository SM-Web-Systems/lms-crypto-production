/**
 * AUTH-02 — Cohort-scoped sponsor billing access.
 *
 * Verifies that sponsors can only view payments, receipts, and badges
 * for students who are members of their own cohorts. Sponsors must not
 * see billing data belonging to another sponsor's cohort members.
 *
 * Admin-tier roles (admin, admin-2, super-admin) retain full access.
 * Resource owners (students) retain access to their own data.
 *
 * AUTH02-01 — Sponsor A lists only their cohort members' payments (exact count)
 * AUTH02-02 — Sponsor A does NOT see Sponsor B's payments in list
 * AUTH02-03 — Sponsor A can view cohort member's payment status
 * AUTH02-04 — Sponsor A cannot view Sponsor B's member's payment → 403
 * AUTH02-05 — Sponsor A can download cohort member's receipt (200 + PDF)
 * AUTH02-06 — Sponsor A cannot download Sponsor B's member's receipt → 403
 * AUTH02-07 — Sponsor A can view cohort member's badge
 * AUTH02-08 — Sponsor A cannot view Sponsor B's member's badge → 403
 * AUTH02-09 — Sponsor A can download cohort member's badge SVG
 * AUTH02-10 — Sponsor A cannot download Sponsor B's member's badge → 403
 * AUTH02-11 — Admin retains full payment list access (sees all)
 * AUTH02-12 — Admin retains full badge access
 * AUTH02-13 — Resource owner (student) can still view own payment
 * AUTH02-14 — Unauthenticated request returns 401
 * AUTH02-15 — Sponsor sees own bulk cohort payment
 * AUTH02-16 — Sponsor with zero cohorts sees empty list
 * AUTH02-17 — Shared student visible to both sponsors
 * AUTH02-18 — Cross-sponsor bulk payment denial
 * AUTH02-19 — Revoked membership removes access
 * AUTH02-20 — Status filter narrows sponsor-scoped list
 * AUTH02-21 — Course filter narrows sponsor-scoped list
 * AUTH02-22 — User without billing.view_all gets 403 on payment list
 * AUTH02-23 — Admin badge download unrestricted
 * AUTH02-24 — Non-existent payment returns 404 not 403
 * AUTH02-25 — Overlapping courses: sponsor sees only matching course payments
 * AUTH02-26 — Sponsor B cannot access Sponsor A's bulk payment status
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a unique test email from a prefix and partial UUID. */
function testEmail(prefix: string, id: string): string {
  return `auth02-${prefix}-${id.slice(0, 6)}@test.com`;
}

/** Create a sponsor-role JWT (legacy role='student', RBAC role_sponsor). */
function sponsorToken(id: string, prefix: string): string {
  return makeToken({ userId: id, email: testEmail(prefix, id), role: 'student' });
}

/**
 * Seed two sponsors, each with their own cohort, student, payment, and badge.
 * Also seeds an admin and a bulk cohort payment for sponsor A.
 */
function seedAuth02() {
  const adminId = uuidv4();
  const sponsorAId = uuidv4();
  const sponsorBId = uuidv4();
  const studentAId = uuidv4();
  const studentBId = uuidv4();
  const courseId = uuidv4();
  const cohortAId = uuidv4();
  const cohortBId = uuidv4();
  const appAId = uuidv4();
  const appBId = uuidv4();
  const paymentAId = uuidv4();
  const paymentBId = uuidv4();
  const bulkPaymentAId = uuidv4();
  const badgeAId = uuidv4();
  const badgeBId = uuidv4();
  const code = `AUTH02-${uuidv4().slice(0, 6)}`;

  // --- Users ---
  // Sponsors use legacy role='student' to avoid trg_auto_assign_user_role
  // granting role_admin (which includes billing.confirm admin bypass).
  db.exec(`
    INSERT INTO users (id,name,email,password_hash,walletAddress,wallet_linking_status)
    VALUES
      ('${adminId}','AUTH02 Admin','${testEmail('admin', adminId)}','hash','GTEST${adminId.slice(0, 8)}','linked'),
      ('${sponsorAId}','AUTH02 Sponsor A','${testEmail('spa', sponsorAId)}','hash','GTEST${sponsorAId.slice(0, 8)}','linked'),
      ('${sponsorBId}','AUTH02 Sponsor B','${testEmail('spb', sponsorBId)}','hash','GTEST${sponsorBId.slice(0, 8)}','linked'),
      ('${studentAId}','AUTH02 Student A','${testEmail('sta', studentAId)}','hash','GTEST${studentAId.slice(0, 8)}','linked'),
      ('${studentBId}','AUTH02 Student B','${testEmail('stb', studentBId)}','hash','GTEST${studentBId.slice(0, 8)}','linked');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${adminId}','role_admin');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${sponsorAId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${sponsorBId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${studentAId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${studentBId}','role_student');

  `);

  // --- RBAC role assignments ---
  db.exec(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${sponsorAId}', 'role_sponsor');
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${sponsorBId}', 'role_sponsor');
  `);

  // --- Course ---
  db.exec(`
    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'AUTH02 Course', 'Test course for AUTH-02', '${code}', '[]');
  `);

  // --- Sponsor cohorts ---
  db.exec(`
    INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name, selected_tier, status)
    VALUES
      ('${cohortAId}', '${sponsorAId}', '${courseId}', 'Cohort A', 'paid', 'active'),
      ('${cohortBId}', '${sponsorBId}', '${courseId}', 'Cohort B', 'paid', 'active');
  `);

  // --- Cohort members ---
  db.exec(`
    INSERT INTO cohort_members (cohort_id, user_id) VALUES ('${cohortAId}', '${studentAId}');
    INSERT INTO cohort_members (cohort_id, user_id) VALUES ('${cohortBId}', '${studentBId}');
  `);

  // --- Applications ---
  db.exec(`
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status)
    VALUES
      ('${appAId}', '${studentAId}', '${courseId}', 'GTESTWALLETA', 'approved'),
      ('${appBId}', '${studentBId}', '${courseId}', 'GTESTWALLETB', 'approved');
  `);

  // --- Payments (student payments) ---
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, confirmed_at)
    VALUES
      ('${paymentAId}', '${studentAId}', '${courseId}', '${appAId}', 2500, 'USD', 'manual', 'confirmed', '2026-01-01T00:00:00Z'),
      ('${paymentBId}', '${studentBId}', '${courseId}', '${appBId}', 3000, 'USD', 'manual', 'confirmed', '2026-01-02T00:00:00Z');
  `);

  // --- Bulk cohort payment for sponsor A ---
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status)
    VALUES ('${bulkPaymentAId}', '${sponsorAId}', '${courseId}', 5000, 'USD', 'manual', 'pending');
    UPDATE sponsor_cohorts SET payment_id = '${bulkPaymentAId}' WHERE id = '${cohortAId}';
  `);

  // --- Badges ---
  db.exec(`
    INSERT INTO certificate_badges (id, user_id, course_id, application_id, badge_svg, badge_hash)
    VALUES
      ('${badgeAId}', '${studentAId}', '${courseId}', '${appAId}', '<svg>Badge A</svg>', 'hash-a-${badgeAId.slice(0, 8)}'),
      ('${badgeBId}', '${studentBId}', '${courseId}', '${appBId}', '<svg>Badge B</svg>', 'hash-b-${badgeBId.slice(0, 8)}');
  `);

  return {
    adminId, sponsorAId, sponsorBId, studentAId, studentBId,
    courseId, cohortAId, cohortBId,
    paymentAId, paymentBId, bulkPaymentAId,
    badgeAId, badgeBId,
  };
}

// ─── Payment list (GET /admin/payments) ─────────────────────────────────────

describe('AUTH-02 — Payment list scope', () => {
  it('AUTH02-01: sponsor A lists exactly their cohort members\' payments + bulk payment', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).toContain(ids.paymentAId);
    expect(paymentIds).toContain(ids.bulkPaymentAId);
    // Exact count: student A's payment + sponsor A's bulk payment = 2
    expect(paymentIds).toHaveLength(2);
  });

  it('AUTH02-02: sponsor A does NOT see sponsor B\'s cohort members\' payments', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).not.toContain(ids.paymentBId);
    // Double-check exact count
    expect(paymentIds).toHaveLength(2);
  });

  it('AUTH02-11: admin retains full payment list access (sees all seeded payments)', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.adminId, email: testEmail('admin', ids.adminId), role: 'admin' });

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).toContain(ids.paymentAId);
    expect(paymentIds).toContain(ids.paymentBId);
    expect(paymentIds).toContain(ids.bulkPaymentAId);
  });

  it('AUTH02-15: sponsor sees own bulk cohort payment in list', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).toContain(ids.bulkPaymentAId);
  });
});

// ─── Payment status (GET /payments/:paymentId/status) ───────────────────────

describe('AUTH-02 — Payment status scope', () => {
  it('AUTH02-03: sponsor A can view cohort member\'s payment status', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentAId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paymentId).toBe(ids.paymentAId);
  });

  it('AUTH02-04: sponsor A cannot view sponsor B\'s member\'s payment → 403', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentBId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('AUTH02-13: resource owner (student) can still view own payment', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.studentAId, email: testEmail('sta', ids.studentAId), role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentAId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paymentId).toBe(ids.paymentAId);
  });

  it('AUTH02-14: unauthenticated request returns 401', async () => {
    const ids = seedAuth02();

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentAId}/status`);

    expect(res.status).toBe(401);
  });

  it('AUTH02-24: non-existent payment returns 404 not 403', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/payments/${uuidv4()}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('AUTH02-26: sponsor B cannot access sponsor A\'s bulk payment status', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorBId, 'spb');

    const res = await request(app)
      .get(`/api/v1/payments/${ids.bulkPaymentAId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── Receipt download (GET /payments/:paymentId/receipt) ────────────────────

describe('AUTH-02 — Receipt download scope', () => {
  it('AUTH02-05: sponsor A can download cohort member\'s receipt', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentAId}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('AUTH02-06: sponsor A cannot download sponsor B\'s member\'s receipt → 403', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentBId}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── Badge view (GET /badges/:badgeId) ──────────────────────────────────────

describe('AUTH-02 — Badge view scope', () => {
  it('AUTH02-07: sponsor A can view cohort member\'s badge', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeAId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.badgeId).toBe(ids.badgeAId);
  });

  it('AUTH02-08: sponsor A cannot view sponsor B\'s member\'s badge → 403', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeBId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('AUTH02-12: admin retains full badge access', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.adminId, email: testEmail('admin', ids.adminId), role: 'admin' });

    const resA = await request(app)
      .get(`/api/v1/badges/${ids.badgeAId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data.badgeId).toBe(ids.badgeAId);

    const resB = await request(app)
      .get(`/api/v1/badges/${ids.badgeBId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data.badgeId).toBe(ids.badgeBId);
  });
});

// ─── Badge download (GET /badges/:badgeId/download) ─────────────────────────

describe('AUTH-02 — Badge download scope', () => {
  it('AUTH02-09: sponsor A can download cohort member\'s badge SVG', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeAId}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('svg');
  });

  it('AUTH02-10: sponsor A cannot download sponsor B\'s member\'s badge → 403', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeBId}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('AUTH02-23: admin can download any badge', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.adminId, email: testEmail('admin', ids.adminId), role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeAId}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('svg');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('AUTH-02 — Edge cases', () => {
  it('AUTH02-16: sponsor with zero cohorts sees empty payment list', async () => {
    // Create a sponsor with role_sponsor but no cohorts
    const sponsorCId = uuidv4();
    db.exec(`
      INSERT INTO users (id,name,email,password_hash,walletAddress,wallet_linking_status)
      VALUES ('${sponsorCId}','AUTH02 Sponsor C','${testEmail('spc', sponsorCId)}','hash','GTEST${sponsorCId.slice(0, 8)}','linked');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${sponsorCId}','role_student');

      INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${sponsorCId}', 'role_sponsor');
    `);

    const token = sponsorToken(sponsorCId, 'spc');

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payments).toHaveLength(0);
  });

  it('AUTH02-17: shared student in both cohorts is visible to both sponsors', async () => {
    const ids = seedAuth02();

    // Add student A to cohort B as well (shared student)
    db.exec(`
      INSERT OR IGNORE INTO cohort_members (cohort_id, user_id)
      VALUES ('${ids.cohortBId}', '${ids.studentAId}');
    `);

    // Sponsor B should now also see student A's payment (course matches)
    const tokenB = sponsorToken(ids.sponsorBId, 'spb');
    const resB = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    const paymentIdsB = resB.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIdsB).toContain(ids.paymentAId);
    expect(paymentIdsB).toContain(ids.paymentBId);

    // Sponsor A still sees student A's payment and bulk (unchanged)
    const tokenA = sponsorToken(ids.sponsorAId, 'spa');
    const resA = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    const paymentIdsA = resA.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIdsA).toContain(ids.paymentAId);
    expect(paymentIdsA).toContain(ids.bulkPaymentAId);

    // Sponsor B can now view student A's badge too
    const resBadge = await request(app)
      .get(`/api/v1/badges/${ids.badgeAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resBadge.status).toBe(200);
    expect(resBadge.body.data.badgeId).toBe(ids.badgeAId);
  });

  it('AUTH02-18: cross-sponsor bulk payment denied (sponsor B cannot see A\'s bulk payment)', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorBId, 'spb');

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).not.toContain(ids.bulkPaymentAId);

    // Sponsor B's list should contain only student B's payment
    expect(paymentIds).toHaveLength(1);
    expect(paymentIds[0]).toBe(ids.paymentBId);
  });

  it('AUTH02-19: revoked membership removes access', async () => {
    const ids = seedAuth02();

    // Verify sponsor A can access student A's payment before revocation
    const token = sponsorToken(ids.sponsorAId, 'spa');
    const resBefore = await request(app)
      .get(`/api/v1/payments/${ids.paymentAId}/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(resBefore.status).toBe(200);

    // Remove student A from cohort A
    db.exec(`DELETE FROM cohort_members WHERE cohort_id = '${ids.cohortAId}' AND user_id = '${ids.studentAId}'`);

    // Sponsor A should no longer see student A's payment
    const resAfter = await request(app)
      .get(`/api/v1/payments/${ids.paymentAId}/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(resAfter.status).toBe(403);

    // Payment list should only contain bulk payment (no student payments)
    const resList = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(resList.status).toBe(200);
    const paymentIds = resList.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).not.toContain(ids.paymentAId);
    expect(paymentIds).toContain(ids.bulkPaymentAId);
    expect(paymentIds).toHaveLength(1);

    // Badge access should also be revoked
    const resBadge = await request(app)
      .get(`/api/v1/badges/${ids.badgeAId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(resBadge.status).toBe(403);
  });

  it('AUTH02-20: status filter narrows sponsor-scoped list', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    // Filter by status=confirmed — should return only student A's payment (confirmed)
    const resConfirmed = await request(app)
      .get('/api/v1/admin/payments?status=confirmed')
      .set('Authorization', `Bearer ${token}`);

    expect(resConfirmed.status).toBe(200);
    const confirmedIds = resConfirmed.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(confirmedIds).toContain(ids.paymentAId);
    expect(confirmedIds).not.toContain(ids.bulkPaymentAId); // bulk is 'pending'
    expect(confirmedIds).toHaveLength(1);

    // Filter by status=pending — should return only bulk payment
    const resPending = await request(app)
      .get('/api/v1/admin/payments?status=pending')
      .set('Authorization', `Bearer ${token}`);

    expect(resPending.status).toBe(200);
    const pendingIds = resPending.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(pendingIds).toContain(ids.bulkPaymentAId);
    expect(pendingIds).not.toContain(ids.paymentAId);
    expect(pendingIds).toHaveLength(1);

    // Filter by non-matching status — empty result
    const resNone = await request(app)
      .get('/api/v1/admin/payments?status=refunded')
      .set('Authorization', `Bearer ${token}`);

    expect(resNone.status).toBe(200);
    expect(resNone.body.data.payments).toHaveLength(0);
  });

  it('AUTH02-21: course filter narrows sponsor-scoped list', async () => {
    const ids = seedAuth02();
    const token = sponsorToken(ids.sponsorAId, 'spa');

    // Filter by the correct course — should return payments
    const res = await request(app)
      .get(`/api/v1/admin/payments?courseId=${ids.courseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payments.length).toBeGreaterThanOrEqual(1);

    // Filter by a non-existent course — empty result
    const resNone = await request(app)
      .get(`/api/v1/admin/payments?courseId=${uuidv4()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(resNone.status).toBe(200);
    expect(resNone.body.data.payments).toHaveLength(0);
  });

  it('AUTH02-22: user without billing.view_all gets 403 on payment list', async () => {
    // Student has no billing.view_all permission
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.studentAId, email: testEmail('sta', ids.studentAId), role: 'student' });

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('AUTH02-25: overlapping courses — sponsor only sees payments for the cohort\'s course', async () => {
    const ids = seedAuth02();

    // Create a second course and a payment for student A on that course
    const course2Id = uuidv4();
    const payment2Id = uuidv4();
    const code2 = `AUTH02X-${uuidv4().slice(0, 6)}`;
    db.exec(`
      INSERT INTO courses (id, title, description, course_code, sections)
      VALUES ('${course2Id}', 'AUTH02 Course 2', 'Second test course', '${code2}', '[]');

      INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status, confirmed_at)
      VALUES ('${payment2Id}', '${ids.studentAId}', '${course2Id}', 1500, 'USD', 'manual', 'confirmed', '2026-02-01T00:00:00Z');
    `);

    // Sponsor A's cohort is for courseId, NOT course2Id.
    // So sponsor A should NOT see payment2Id even though student A is in their cohort.
    const token = sponsorToken(ids.sponsorAId, 'spa');

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).not.toContain(payment2Id);
    // Should still see the original 2 payments
    expect(paymentIds).toContain(ids.paymentAId);
    expect(paymentIds).toContain(ids.bulkPaymentAId);
    expect(paymentIds).toHaveLength(2);

    // Single-resource access should also be denied
    const resStatus = await request(app)
      .get(`/api/v1/payments/${payment2Id}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(resStatus.status).toBe(403);
  });
});
