/**
 * Deliverable 3 Batch 2 — Sponsor Impact Report Enhancements
 *
 * D3B2-01  Impact report accepts date-range query params
 * D3B2-02  Impact report returns only cohorts within date range
 * D3B2-03  Impact report rejects invalid date format with 400
 * D3B2-04  Impact report without date params returns all-time data
 * D3B2-05  Impact report returns drop-off data scoped to sponsor
 * D3B2-06  Impact report drop-off is empty when no lesson completions
 * D3B2-07  Impact report CSV export returns valid CSV
 * D3B2-08  Billing accepts date-range query params
 * D3B2-09  Billing returns only payments within date range
 * D3B2-10  Billing rejects invalid date format with 400
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedSponsor() {
  const userId = uuidv4();
  const email = `sponsor-b2-${Date.now()}@test.com`;
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'Sponsor B2', '${email}', '${HASH}', 'student');
  `);
  db.exec(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${userId}', 'role_sponsor');`);
  return { userId, email, token: makeToken({ userId, email, role: 'student' }) };
}

function seedCourse(title: string) {
  const id = uuidv4();
  const code = `COURSE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  db.exec(`
    INSERT INTO courses (id, title, course_code, description)
    VALUES ('${id}', '${title}', '${code}', 'desc');
  `);
  return { id, code };
}

function seedCohort(sponsorId: string, courseId: string, name: string, createdAt: string) {
  const id = uuidv4();
  db.exec(`
    INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, status, created_at)
    VALUES ('${id}', '${name}', '${sponsorId}', '${courseId}', 'active', '${createdAt}');
  `);
  return id;
}

function seedMember(cohortId: string, addedAt: string): string {
  const userId = uuidv4();
  const email = `member-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'Member', '${email}', '${HASH}', 'student');
  `);
  db.exec(`
    INSERT INTO cohort_members (cohort_id, user_id, added_at)
    VALUES ('${cohortId}', '${userId}', '${addedAt}');
  `);
  return userId;
}

function seedPayment(userId: string, courseId: string, createdAt: string) {
  const id = uuidv4();
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status, created_at, updated_at)
    VALUES ('${id}', '${userId}', '${courseId}', 10000, 'USD', 'manual', 'confirmed', '${createdAt}', '${createdAt}');
  `);
  return id;
}

function seedLessonCompletion(userId: string, courseId: string, itemId: string, completedAt: string) {
  const id = uuidv4();
  db.exec(`
    INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, completed_at)
    VALUES ('${id}', '${userId}', '${courseId}', '${itemId}', 'sec-1', '${completedAt}');
  `);
}

describe('Sponsor Impact Report — Batch 2 Enhancements', () => {
  let sponsor: ReturnType<typeof seedSponsor>;
  let course: ReturnType<typeof seedCourse>;

  beforeEach(() => {
    sponsor = seedSponsor();
    course = seedCourse('Test Course B2');
  });

  // ─── Date-Range Filtering ─────────────────────────────────────────────

  it('D3B2-01: impact report accepts from/to query params and returns 200', async () => {
    seedCohort(sponsor.userId, course.id, 'Q1 Cohort', '2026-01-15');
    seedCohort(sponsor.userId, course.id, 'Q3 Cohort', '2026-07-15');

    const res = await request(app)
      .get('/api/v1/sponsor/impact-report?from=2026-01-01&to=2026-03-31')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('cohorts');
  });

  it('D3B2-02: impact report with date range filters to matching cohorts only', async () => {
    const q1 = seedCohort(sponsor.userId, course.id, 'Q1 Cohort', '2026-02-01');
    seedMember(q1, '2026-02-05');
    const q3 = seedCohort(sponsor.userId, course.id, 'Q3 Cohort', '2026-08-01');
    seedMember(q3, '2026-08-05');

    const res = await request(app)
      .get('/api/v1/sponsor/impact-report?from=2026-01-01&to=2026-06-30')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.cohorts.map((c: { cohort_name: string }) => c.cohort_name);
    expect(names).toContain('Q1 Cohort');
    expect(names).not.toContain('Q3 Cohort');
  });

  it('D3B2-03: impact report rejects invalid date format with 400', async () => {
    const res = await request(app)
      .get('/api/v1/sponsor/impact-report?from=not-a-date')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('D3B2-04: impact report without date params returns all cohorts', async () => {
    seedCohort(sponsor.userId, course.id, 'Old Cohort', '2025-01-01');
    seedCohort(sponsor.userId, course.id, 'New Cohort', '2026-09-01');

    const res = await request(app)
      .get('/api/v1/sponsor/impact-report')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.cohorts.map((c: { cohort_name: string }) => c.cohort_name);
    expect(names).toContain('Old Cohort');
    expect(names).toContain('New Cohort');
  });

  // ─── Drop-off Analysis ────────────────────────────────────────────────

  it('D3B2-05: impact report includes drop-off data scoped to sponsor cohorts', async () => {
    const cohortId = seedCohort(sponsor.userId, course.id, 'Drop Cohort', '2026-03-01');
    const memberId = seedMember(cohortId, '2026-03-05');

    // Seed a course code enrollment for the member
    db.exec(`INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES ('${memberId}', '${course.code}');`);

    // Seed lesson completions
    seedLessonCompletion(memberId, course.id, 'lesson-1', '2026-03-10');
    seedLessonCompletion(memberId, course.id, 'lesson-2', '2026-03-12');

    const res = await request(app)
      .get('/api/v1/sponsor/impact-report')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('dropOff');
    expect(Array.isArray(res.body.data.dropOff)).toBe(true);
  });

  it('D3B2-06: drop-off is empty array when no lesson completions exist', async () => {
    seedCohort(sponsor.userId, course.id, 'Empty Cohort', '2026-04-01');

    const res = await request(app)
      .get('/api/v1/sponsor/impact-report')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.dropOff).toEqual([]);
  });

  // ─── CSV Export ────────────────────────────────────────────────────────

  it('D3B2-07: impact report with format=csv returns valid CSV', async () => {
    const cohortId = seedCohort(sponsor.userId, course.id, 'CSV Cohort', '2026-05-01');
    seedMember(cohortId, '2026-05-05');

    const res = await request(app)
      .get('/api/v1/sponsor/impact-report?format=csv')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const lines = res.text.split('\n');
    expect(lines[0]).toMatch(/Cohort/); // Header row
    expect(lines.length).toBeGreaterThan(1); // Header + at least one data row
  });

  // ─── Billing Date Filtering ───────────────────────────────────────────

  it('D3B2-08: billing accepts from/to query params and returns 200', async () => {
    seedPayment(sponsor.userId, course.id, '2026-03-15');

    const res = await request(app)
      .get('/api/v1/sponsor/billing?from=2026-03-01&to=2026-03-31')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('D3B2-09: billing with date range filters to matching payments only', async () => {
    seedPayment(sponsor.userId, course.id, '2026-02-15');
    seedPayment(sponsor.userId, course.id, '2026-08-15');

    const res = await request(app)
      .get('/api/v1/sponsor/billing?from=2026-01-01&to=2026-06-30')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payments.length).toBe(1);
    expect(res.body.data.total).toBe(1);
  });

  it('D3B2-10: billing rejects invalid date format with 400', async () => {
    const res = await request(app)
      .get('/api/v1/sponsor/billing?from=2026/01/01')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
