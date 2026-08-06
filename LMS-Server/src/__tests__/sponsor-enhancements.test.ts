/**
 * Tests for Phase 22 C4 — Sponsor Enhancements.
 *
 * SP-1  — bulkInviteToCohort adds existing user to cohort
 * SP-2  — bulkInviteToCohort creates invite for unknown email
 * SP-3  — bulkInviteToCohort skips already-in-cohort member
 * SP-4  — bulkInviteToCohort validates email format
 * SP-5  — getSpendingReport returns per-cohort breakdown
 * SP-6  — getSpendingReport returns totalSpentCents for confirmed only
 * SP-7  — POST /admin/cohorts/:id/send-reminder returns sent count
 * SP-8  — GET /admin/cohorts/spending-report returns 200 with cohort list
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import {
  bulkInviteToCohort,
  getSpendingReport,
} from '../services/cohortService.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'User ${suffix}', '${suffix}@test.com', '${HASH}', '${role}');
  `);
  return userId;
}

function seedCourse(title: string, code: string) {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', '${title}', '${code}', '[]');
  `);
  return courseId;
}

function seedEnrollment(userId: string, courseCode: string) {
  db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', '${courseCode}');`);
}

function seedCohort(name: string, sponsorId: string, courseId: string) {
  const cohortId = uuidv4();
  db.exec(`
    INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, created_at)
    VALUES ('${cohortId}', '${name}', '${sponsorId}', '${courseId}', 'free', 'draft', datetime('now'));
  `);
  return cohortId;
}

function addCohortMember(cohortId: string, userId: string) {
  db.exec(`INSERT INTO cohort_members (cohort_id, user_id, added_at) VALUES ('${cohortId}', '${userId}', datetime('now'));`);
}

function seedPayment(userId: string, courseId: string, amountCents: number, status: string) {
  const paymentId = uuidv4();
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status, created_at, updated_at)
    VALUES ('${paymentId}', '${userId}', '${courseId}', ${amountCents}, 'USD', 'manual', '${status}', datetime('now'), datetime('now'));
  `);
  return paymentId;
}

describe('Phase 22 C4 — Sponsor Enhancements', () => {
  let adminId: string;
  let adminToken: string;
  let courseId: string;
  const courseCode = 'SP-TEST';

  beforeEach(() => {
    adminId = seedUser('admin', 'spadmin');
    adminToken = makeToken({ userId: adminId, email: 'spadmin@test.com', role: 'admin' });
    courseId = seedCourse('Sponsor Test Course', courseCode);

    // Ensure course_invites table exists (not in schema.sql, created at runtime)
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='course_invites'").get()) {
      db.exec(`
        CREATE TABLE course_invites (
          id TEXT PRIMARY KEY,
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
          created_at TEXT DEFAULT (datetime('now')),
          expires_at TEXT
        );
      `);
    }
  });

  // SP-1: bulkInviteToCohort adds existing user to cohort
  it('SP-1: adds existing enrolled user to cohort', () => {
    const studentId = seedUser('student', 'enrolled');
    seedEnrollment(studentId, courseCode);
    const cohortId = seedCohort('Test Cohort', adminId, courseId);

    const result = bulkInviteToCohort(cohortId, ['enrolled@test.com']);
    expect(result.added).toBe(1);
    expect(result.invited).toBe(0);
    expect(result.alreadyInCohort).toBe(0);

    // Verify member in cohort
    const member = db.prepare('SELECT * FROM cohort_members WHERE cohort_id = ? AND user_id = ?').get(cohortId, studentId);
    expect(member).toBeDefined();
  });

  // SP-2: bulkInviteToCohort creates invite for unknown email
  it('SP-2: creates invite for unknown email', () => {
    const cohortId = seedCohort('Test Cohort', adminId, courseId);

    const result = bulkInviteToCohort(cohortId, ['newuser@example.com']);
    expect(result.invited).toBe(1);
    expect(result.added).toBe(0);

    // Verify course_invites row
    const invite = db.prepare("SELECT * FROM course_invites WHERE email = 'newuser@example.com' AND status = 'pending'").get();
    expect(invite).toBeDefined();
  });

  // SP-3: bulkInviteToCohort skips already-in-cohort member
  it('SP-3: skips already-in-cohort member', () => {
    const studentId = seedUser('student', 'existing');
    seedEnrollment(studentId, courseCode);
    const cohortId = seedCohort('Test Cohort', adminId, courseId);
    addCohortMember(cohortId, studentId);

    const result = bulkInviteToCohort(cohortId, ['existing@test.com']);
    expect(result.alreadyInCohort).toBe(1);
    expect(result.added).toBe(0);
  });

  // SP-4: bulkInviteToCohort validates email format
  it('SP-4: reports invalid email in errors', () => {
    const cohortId = seedCohort('Test Cohort', adminId, courseId);

    const result = bulkInviteToCohort(cohortId, ['not-an-email', 'valid@test.com']);
    expect(result.errors).toContain('not-an-email');
    expect(result.invited).toBe(1); // valid@test.com is a new user → invited
  });

  // SP-5: getSpendingReport returns per-cohort breakdown
  it('SP-5: spending report returns per-cohort data', () => {
    const cohortId = seedCohort('Acme Q3', adminId, courseId);
    const paymentId = seedPayment(adminId, courseId, 25000, 'confirmed');
    db.exec(`UPDATE sponsor_cohorts SET payment_id = '${paymentId}' WHERE id = '${cohortId}'`);

    const report = getSpendingReport();
    expect(report.cohorts.length).toBeGreaterThanOrEqual(1);
    const c = report.cohorts.find((r) => r.cohortId === cohortId);
    expect(c).toBeDefined();
    expect(c!.cohortName).toBe('Acme Q3');
    expect(c!.amountCents).toBe(25000);
    expect(c!.paymentStatus).toBe('confirmed');
  });

  // SP-6: getSpendingReport totalSpentCents only counts confirmed
  it('SP-6: totalSpentCents includes only confirmed payments', () => {
    const c1 = seedCohort('Confirmed', adminId, courseId);
    const p1 = seedPayment(adminId, courseId, 10000, 'confirmed');
    db.exec(`UPDATE sponsor_cohorts SET payment_id = '${p1}' WHERE id = '${c1}'`);

    const c2 = seedCohort('Pending', adminId, courseId);
    const p2 = seedPayment(adminId, courseId, 5000, 'pending');
    db.exec(`UPDATE sponsor_cohorts SET payment_id = '${p2}' WHERE id = '${c2}'`);

    const report = getSpendingReport();
    expect(report.totalSpentCents).toBe(10000); // only confirmed
  });

  // SP-7: POST send-reminder returns sent count
  it('SP-7: send-reminder endpoint returns sent count', async () => {
    const studentId = seedUser('student', 'remind');
    const cohortId = seedCohort('Remind Cohort', adminId, courseId);
    addCohortMember(cohortId, studentId);

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/send-reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sent).toBe(1);
    expect(res.body.data.cohortId).toBe(cohortId);
  });

  // SP-8: GET spending-report returns 200 with cohort list
  it('SP-8: spending-report endpoint returns 200', async () => {
    seedCohort('Report Cohort', adminId, courseId);

    const res = await request(app)
      .get('/api/v1/admin/cohorts/spending-report')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalSpentCents).toBeDefined();
    expect(Array.isArray(res.body.data.cohorts)).toBe(true);
  });
});
