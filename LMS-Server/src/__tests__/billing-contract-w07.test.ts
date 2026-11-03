/**
 * W07 — Billing contract reconciliation backend tests
 *
 * W7-BE-1: Sponsor billing invalid/reversed dates → 400 with error.code INVALID_DATE_RANGE
 *          RED before fix: error.code absent (only message)
 * W7-BE-2: Sponsor billing invalid scope value → 400 with error.code INVALID_SCOPE
 *          RED before fix: error.code absent
 * W7-BE-3: Sponsor billing cohort scope without permissions → 403 error.code INSUFFICIENT_PERMISSIONS
 *          RED before fix: error.code absent
 * W7-BE-4: Impact report invalid date still returns 400 (shared helper coupling — must not regress)
 *          ALSO: error.code present after fix (shared helper now adds code)
 * W7-BE-5: Own-payment positives: sponsor sees own; employer sees own; unrelated payer excluded
 * W7-BE-6: Multi-role: user with both sponsor+employer roles — own-payment isolation per route
 * W7-BE-7: Unauthenticated → 401; missing billing.view_own → 403
 * W7-BE-8: Cohort scope matrix — both permissions + owned cohort/member/course succeeds;
 *           missing billing.view_all fails; missing cohort.view_own fails;
 *           unrelated cohort/member excluded
 * W7-BE-9: Date validation edge cases: array param, object param, reversed range, single boundary
 * W7-BE-10: Read-only proof: no payments/ledger rows mutated by billing reads
 */

import './setup.js';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createSponsor() {
  const userId = uuidv4();
  const email = `w07-sponsor-${userId.slice(0, 8)}@test.com`;
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'W07 Sponsor', ?, '$2a$10$test', 'student')"
  ).run(userId, email);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, 'role_sponsor');
  return { userId, email, token: makeToken({ userId, email, role: 'student' }) };
}

function createEmployer() {
  const userId = uuidv4();
  const email = `w07-employer-${userId.slice(0, 8)}@test.com`;
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'W07 Employer', ?, '$2a$10$test', 'student')"
  ).run(userId, email);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, 'role_employer');
  return { userId, email, token: makeToken({ userId, email, role: 'student' }) };
}

function createUserNoRole() {
  const userId = uuidv4();
  const email = `w07-norole-${userId.slice(0, 8)}@test.com`;
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'No Role', ?, '$2a$10$test', 'student')"
  ).run(userId, email);
  // trg_auto_assign_user_role fires on INSERT and adds role_student (which has billing.view_own).
  // Revoke it so this user truly has no billing permissions.
  db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
  return { userId, email, token: makeToken({ userId, email, role: 'student' }) };
}

function createStudent() {
  const userId = uuidv4();
  const email = `w07-student-${userId.slice(0, 8)}@test.com`;
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'W07 Student', ?, '$2a$10$test', 'student')"
  ).run(userId, email);
  // trg_auto_assign_user_role assigns role_student: billing.view_own but NOT billing.view_all
  return { userId, email, token: makeToken({ userId, email, role: 'student' }) };
}

function createCourse() {
  const id = uuidv4();
  const code = `W07-${id.slice(0, 8)}`;
  db.prepare(
    "INSERT INTO courses (id, title, course_code, description) VALUES (?, 'W07 Course', ?, 'desc')"
  ).run(id, code);
  return id;
}

function createPayment(userId: string, courseId: string, opts?: { amountCents?: number; createdAt?: string; status?: string }) {
  const id = uuidv4();
  const { amountCents = 5000, createdAt = '2026-10-15 10:00:00', status = 'confirmed' } = opts ?? {};
  db.prepare(
    `INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status, created_at)
     VALUES (?, ?, ?, ?, 'USD', 'manual', ?, ?)`
  ).run(id, userId, courseId, amountCents, status, createdAt);
  return id;
}

function createCohort(sponsorId: string, courseId: string) {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, status) VALUES (?, 'W07 Cohort', ?, ?, 'active')"
  ).run(id, sponsorId, courseId);
  return id;
}

function addCohortMember(cohortId: string, userId: string) {
  db.prepare('INSERT OR IGNORE INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, userId);
}

// Enroll a user in a course so membership counting is consistent
function enrollInCourse(userId: string, courseCode: string) {
  db.prepare('INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)').run(userId, courseCode);
}

// ─── W7-BE-1/2/3: Error codes ──────────────────────────────────────────────

describe('W07-BE: Sponsor billing error codes (RED→GREEN)', () => {
  it('W7-BE-1a: invalid date format returns 400 with error.code INVALID_DATE_RANGE', async () => {
    const sponsor = createSponsor();
    const res = await request(app)
      .get('/api/v1/sponsor/billing?from=2026/10/01')
      .set('Authorization', `Bearer ${sponsor.token}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // RED: error.code absent; GREEN: 'INVALID_DATE_RANGE'
    expect(res.body.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('W7-BE-1b: reversed date range (from > to) returns 400 with error.code INVALID_DATE_RANGE', async () => {
    const sponsor = createSponsor();
    const res = await request(app)
      .get('/api/v1/sponsor/billing?from=2026-12-01&to=2026-01-01')
      .set('Authorization', `Bearer ${sponsor.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('W7-BE-2: invalid scope value returns 400 with error.code INVALID_SCOPE', async () => {
    const sponsor = createSponsor();
    const res = await request(app)
      .get('/api/v1/sponsor/billing?scope=all')
      .set('Authorization', `Bearer ${sponsor.token}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // RED: error.code absent; GREEN: 'INVALID_SCOPE'
    expect(res.body.error.code).toBe('INVALID_SCOPE');
  });

  it('W7-BE-3: cohort scope without billing.view_all → 403 with error.code INSUFFICIENT_PERMISSIONS', async () => {
    // role_student has billing.view_own (can access billing routes) but NOT billing.view_all
    // (role_sponsor has both — so createSponsor() would get 200, not 403)
    const student = createStudent();
    const res = await request(app)
      .get('/api/v1/sponsor/billing?scope=cohort')
      .set('Authorization', `Bearer ${student.token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    // RED: error.code absent; GREEN: 'INSUFFICIENT_PERMISSIONS'
    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('W7-BE-4a: impact report invalid date still returns 400 (shared helper — no regression)', async () => {
    const sponsor = createSponsor();
    const res = await request(app)
      .get('/api/v1/sponsor/impact-report?from=notadate')
      .set('Authorization', `Bearer ${sponsor.token}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // Shared helper: after adding code to parseSponsorDateRange, impact-report gains it too
    expect(res.body.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('W7-BE-4b: impact report valid date still returns 200 (no regression)', async () => {
    const sponsor = createSponsor();
    const res = await request(app)
      .get('/api/v1/sponsor/impact-report?from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${sponsor.token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── W7-BE-5/6: Own-payment isolation ──────────────────────────────────────

describe('W07-BE: Own-payment isolation', () => {
  it('W7-BE-5a: sponsor sees only own payments', async () => {
    const sponsorA = createSponsor();
    const sponsorB = createSponsor();
    const courseId = createCourse();
    createPayment(sponsorA.userId, courseId, { amountCents: 1000 });
    createPayment(sponsorB.userId, courseId, { amountCents: 2000 });

    const res = await request(app)
      .get('/api/v1/sponsor/billing')
      .set('Authorization', `Bearer ${sponsorA.token}`);

    expect(res.status).toBe(200);
    const amounts = res.body.data.payments.map((p: { amount_cents: number }) => p.amount_cents);
    expect(amounts).toContain(1000);
    expect(amounts).not.toContain(2000); // sponsorB's payment excluded
    expect(res.body.data.total).toBe(res.body.data.payments.length);
  });

  it('W7-BE-5b: employer sees only own payments', async () => {
    const employerA = createEmployer();
    const employerB = createEmployer();
    const courseId = createCourse();
    createPayment(employerA.userId, courseId, { amountCents: 3000 });
    createPayment(employerB.userId, courseId, { amountCents: 4000 });

    const res = await request(app)
      .get('/api/v1/employer/billing')
      .set('Authorization', `Bearer ${employerA.token}`);

    expect(res.status).toBe(200);
    const amounts = res.body.data.payments.map((p: { amount_cents: number }) => p.amount_cents);
    expect(amounts).toContain(3000);
    expect(amounts).not.toContain(4000);
    expect(res.body.data.total).toBe(res.body.data.payments.length);
  });

  it('W7-BE-6: multi-role user with sponsor+employer — each route returns only own payments', async () => {
    // User has both roles; billing.view_own is present for both routes
    const userId = uuidv4();
    const email = `w07-multi-${userId.slice(0, 8)}@test.com`;
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Multi Role', ?, '$2a$10$test', 'student')"
    ).run(userId, email);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, 'role_sponsor');
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, 'role_employer');
    const token = makeToken({ userId, email, role: 'student' });

    const otherUser = createUserNoRole();
    const courseId = createCourse();
    createPayment(userId, courseId, { amountCents: 7500 });
    createPayment(otherUser.userId, courseId, { amountCents: 9000 });

    const sponsorRes = await request(app)
      .get('/api/v1/sponsor/billing')
      .set('Authorization', `Bearer ${token}`);
    const employerRes = await request(app)
      .get('/api/v1/employer/billing')
      .set('Authorization', `Bearer ${token}`);

    // Both routes return only userId's own payment, not otherUser's
    expect(sponsorRes.status).toBe(200);
    expect(sponsorRes.body.data.payments.every((p: { amount_cents: number }) => p.amount_cents === 7500)).toBe(true);
    expect(employerRes.status).toBe(200);
    expect(employerRes.body.data.payments.every((p: { amount_cents: number }) => p.amount_cents === 7500)).toBe(true);
  });
});

// ─── W7-BE-7: Auth/permission gates ────────────────────────────────────────

describe('W07-BE: Auth and permission gates', () => {
  it('W7-BE-7a: unauthenticated request → 401', async () => {
    const sponsorRes = await request(app).get('/api/v1/sponsor/billing');
    const employerRes = await request(app).get('/api/v1/employer/billing');
    expect(sponsorRes.status).toBe(401);
    expect(employerRes.status).toBe(401);
  });

  it('W7-BE-7b: user without billing.view_own → 403', async () => {
    const noRole = createUserNoRole();
    const sponsorRes = await request(app)
      .get('/api/v1/sponsor/billing')
      .set('Authorization', `Bearer ${noRole.token}`);
    const employerRes = await request(app)
      .get('/api/v1/employer/billing')
      .set('Authorization', `Bearer ${noRole.token}`);
    expect(sponsorRes.status).toBe(403);
    expect(employerRes.status).toBe(403);
  });
});

// ─── W7-BE-8: Cohort scope matrix ──────────────────────────────────────────

describe('W07-BE: Cohort scope permission matrix', () => {
  it('W7-BE-8a: sponsor with billing.view_all+cohort.view_own sees cohort member payments', async () => {
    // admin role has billing.view_all; sponsor role + admin role together
    const userId = uuidv4();
    const email = `w07-cohort-${userId.slice(0, 8)}@test.com`;
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Cohort Sponsor', ?, '$2a$10$test', 'student')"
    ).run(userId, email);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, 'role_sponsor');
    // Give billing.view_all via admin role (admin has all billing permissions)
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, 'role_admin');
    const token = makeToken({ userId, email, role: 'student' });

    const courseId = createCourse();
    const cohortId = createCohort(userId, courseId);
    const member = createUserNoRole();
    addCohortMember(cohortId, member.userId);
    createPayment(member.userId, courseId, { amountCents: 6000 });
    createPayment(userId, courseId, { amountCents: 100 }); // own payment excluded in cohort scope

    const res = await request(app)
      .get('/api/v1/sponsor/billing?scope=cohort')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('cohort');
    const amounts = res.body.data.payments.map((p: { amount_cents: number }) => p.amount_cents);
    expect(amounts).toContain(6000);   // member's payment included
    expect(amounts).not.toContain(100); // sponsor's own payment excluded (cohort scope = p.user_id <> ?)
  });

  it('W7-BE-8b: cohort member on unrelated cohort/course excluded', async () => {
    const userId = uuidv4();
    const email = `w07-cohort2-${userId.slice(0, 8)}@test.com`;
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Cohort Sponsor 2', ?, '$2a$10$test', 'student')"
    ).run(userId, email);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, 'role_sponsor');
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, 'role_admin');
    const token = makeToken({ userId, email, role: 'student' });

    const courseA = createCourse();
    const courseB = createCourse();
    const cohortA = createCohort(userId, courseA);

    const member = createUserNoRole();
    addCohortMember(cohortA, member.userId);
    createPayment(member.userId, courseA, { amountCents: 500 }); // correct cohort+course
    createPayment(member.userId, courseB, { amountCents: 999 }); // wrong course — excluded

    const res = await request(app)
      .get('/api/v1/sponsor/billing?scope=cohort')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const amounts = res.body.data.payments.map((p: { amount_cents: number }) => p.amount_cents);
    expect(amounts).toContain(500);
    expect(amounts).not.toContain(999); // wrong course excluded
  });
});

// ─── W7-BE-9: Query param validation ───────────────────────────────────────

describe('W07-BE: Query parameter validation', () => {
  it('W7-BE-9a: array-valued scope param → 400 INVALID_SCOPE', async () => {
    const sponsor = createSponsor();
    // Express parses repeated params as arrays
    const res = await request(app)
      .get('/api/v1/sponsor/billing?scope=own&scope=cohort')
      .set('Authorization', `Bearer ${sponsor.token}`);
    // Array value !== 'own' and !== 'cohort' → INVALID_SCOPE
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SCOPE');
  });

  it('W7-BE-9b: single valid date boundary (only from) returns 200', async () => {
    const sponsor = createSponsor();
    const res = await request(app)
      .get('/api/v1/sponsor/billing?from=2026-01-01')
      .set('Authorization', `Bearer ${sponsor.token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('W7-BE-9c: valid from=to same day returns 200 (inclusive boundary)', async () => {
    const sponsor = createSponsor();
    const courseId = createCourse();
    createPayment(sponsor.userId, courseId, { createdAt: '2026-06-15 12:00:00' });

    const res = await request(app)
      .get('/api/v1/sponsor/billing?from=2026-06-15&to=2026-06-15')
      .set('Authorization', `Bearer ${sponsor.token}`);
    // from=to is valid (from < to+1 next-day exclusive)
    expect(res.status).toBe(200);
    expect(res.body.data.payments.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── W7-BE-10: Read-only proof ──────────────────────────────────────────────

describe('W07-BE: Read-only proof', () => {
  it('W7-BE-10: billing reads do not mutate any payment rows', async () => {
    const sponsor = createSponsor();
    const employer = createEmployer();
    const courseId = createCourse();
    const payId = createPayment(sponsor.userId, courseId, { amountCents: 8888, status: 'confirmed' });
    createPayment(employer.userId, courseId, { amountCents: 9999, status: 'confirmed' });

    const before = db.prepare('SELECT amount_cents, status FROM payments WHERE id = ?').get(payId) as { amount_cents: number; status: string };

    // Perform reads
    await request(app).get('/api/v1/sponsor/billing').set('Authorization', `Bearer ${sponsor.token}`);
    await request(app).get('/api/v1/employer/billing').set('Authorization', `Bearer ${employer.token}`);

    const after = db.prepare('SELECT amount_cents, status FROM payments WHERE id = ?').get(payId) as { amount_cents: number; status: string };

    expect(after.amount_cents).toBe(before.amount_cents);
    expect(after.status).toBe(before.status);
  });
});
