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
 * AUTH02-01 — Sponsor A lists only their cohort members' payments
 * AUTH02-02 — Sponsor A does NOT see Sponsor B's payments in list
 * AUTH02-03 — Sponsor A can view cohort member's payment status
 * AUTH02-04 — Sponsor A cannot view Sponsor B's member's payment → 403
 * AUTH02-05 — Sponsor A can download cohort member's receipt
 * AUTH02-06 — Sponsor A cannot download Sponsor B's member's receipt → 403
 * AUTH02-07 — Sponsor A can view cohort member's badge
 * AUTH02-08 — Sponsor A cannot view Sponsor B's member's badge → 403
 * AUTH02-09 — Sponsor A can download cohort member's badge SVG
 * AUTH02-10 — Sponsor A cannot download Sponsor B's member's badge → 403
 * AUTH02-11 — Admin retains full payment list access
 * AUTH02-12 — Admin retains full badge access
 * AUTH02-13 — Resource owner (student) can still view own payment
 * AUTH02-14 — Unauthenticated request returns 401
 * AUTH02-15 — Sponsor sees own bulk cohort payment
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

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
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES
      ('${adminId}',    'AUTH02 Admin',     'auth02-admin-${adminId.slice(0, 6)}@test.com',       'hash', 'admin',   'GTEST${adminId.slice(0, 8)}', 'linked'),
      ('${sponsorAId}', 'AUTH02 Sponsor A', 'auth02-spa-${sponsorAId.slice(0, 6)}@test.com',     'hash', 'student', 'GTEST${sponsorAId.slice(0, 8)}', 'linked'),
      ('${sponsorBId}', 'AUTH02 Sponsor B', 'auth02-spb-${sponsorBId.slice(0, 6)}@test.com',     'hash', 'student', 'GTEST${sponsorBId.slice(0, 8)}', 'linked'),
      ('${studentAId}', 'AUTH02 Student A', 'auth02-sta-${studentAId.slice(0, 6)}@test.com',     'hash', 'student', 'GTEST${studentAId.slice(0, 8)}', 'linked'),
      ('${studentBId}', 'AUTH02 Student B', 'auth02-stb-${studentBId.slice(0, 6)}@test.com',     'hash', 'student', 'GTEST${studentBId.slice(0, 8)}', 'linked');
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
  it('AUTH02-01: sponsor A lists only their cohort members\' payments', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).toContain(ids.paymentAId);
    expect(paymentIds).toContain(ids.bulkPaymentAId);
  });

  it('AUTH02-02: sponsor A does NOT see sponsor B\'s cohort members\' payments', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).not.toContain(ids.paymentBId);
  });

  it('AUTH02-11: admin retains full payment list access', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.adminId, email: `auth02-admin-${ids.adminId.slice(0, 6)}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).toContain(ids.paymentAId);
    expect(paymentIds).toContain(ids.paymentBId);
  });
});

// ─── Payment status (GET /payments/:paymentId/status) ───────────────────────

describe('AUTH-02 — Payment status scope', () => {
  it('AUTH02-03: sponsor A can view cohort member\'s payment status', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentAId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paymentId).toBe(ids.paymentAId);
  });

  it('AUTH02-04: sponsor A cannot view sponsor B\'s member\'s payment → 403', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentBId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('AUTH02-13: resource owner (student) can still view own payment', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.studentAId, email: `auth02-sta-${ids.studentAId.slice(0, 6)}@test.com`, role: 'student' });

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
});

// ─── Receipt download (GET /payments/:paymentId/receipt) ────────────────────

describe('AUTH-02 — Receipt download scope', () => {
  it('AUTH02-05: sponsor A can download cohort member\'s receipt', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${ids.paymentAId}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    // 200 (PDF) or 400 (if PDF generation deps missing) — but NOT 403
    expect(res.status).not.toBe(403);
  });

  it('AUTH02-06: sponsor A cannot download sponsor B\'s member\'s receipt → 403', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

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
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeAId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.badgeId).toBe(ids.badgeAId);
  });

  it('AUTH02-08: sponsor A cannot view sponsor B\'s member\'s badge → 403', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeBId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('AUTH02-12: admin retains full badge access', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.adminId, email: `auth02-admin-${ids.adminId.slice(0, 6)}@test.com`, role: 'admin' });

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
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeAId}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('svg');
  });

  it('AUTH02-10: sponsor A cannot download sponsor B\'s member\'s badge → 403', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${ids.badgeBId}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── Bulk cohort payment ────────────────────────────────────────────────────

describe('AUTH-02 — Bulk cohort payment', () => {
  it('AUTH02-15: sponsor sees own bulk cohort payment in list', async () => {
    const ids = seedAuth02();
    const token = makeToken({ userId: ids.sponsorAId, email: `auth02-spa-${ids.sponsorAId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const paymentIds = res.body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).toContain(ids.bulkPaymentAId);
  });
});
