/**
 * analytics-cohort-insights.test.ts — Phase 25 C4
 *
 * COHORT-AN-1: GET /analytics/cohorts/insights returns enrollmentsByMonth
 * COHORT-AN-2: GET /analytics/cohorts/insights returns cohort completion rates
 * COHORT-AN-3: GET /analytics/cohorts/insights?format=csv returns CSV
 * SPONSOR-ROI-1: GET /analytics/sponsors/roi returns sponsor breakdown
 * SPONSOR-ROI-2: GET /analytics/sponsors/roi?from=&to= filters by date
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

let adminId: string;
let adminToken: string;
let sponsorId: string;
let courseId: string;
let cohortId: string;
let studentId: string;

function seedAnalyticsData() {
  adminId = uuidv4();
  sponsorId = uuidv4();
  courseId = uuidv4();
  cohortId = uuidv4();
  studentId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin Analytics', ?, ?, 'admin')`,
  ).run(adminId, `admin-an-${adminId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor One', ?, ?, 'admin')`,
  ).run(sponsorId, `sponsor-${sponsorId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student One', ?, ?, 'student')`,
  ).run(studentId, `student-${studentId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Analytics Course', 'Test', 'ANC-101', '[]')`,
  ).run(courseId);

  const paymentId = uuidv4();
  db.prepare(
    `INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status) VALUES (?, ?, ?, 50000, 'USD', 'manual', 'confirmed')`,
  ).run(paymentId, sponsorId, courseId);

  db.prepare(
    `INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, payment_id, status) VALUES (?, 'Test Cohort', ?, ?, 'paid', ?, 'active')`,
  ).run(cohortId, sponsorId, courseId, paymentId);

  db.prepare(
    `INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)`,
  ).run(cohortId, studentId);

  adminToken = makeToken({ userId: adminId, email: `admin-an-${adminId}@test.com`, role: 'admin' });
}

beforeEach(() => {
  seedAnalyticsData();
});

describe('GET /api/v1/analytics/cohorts/insights (Phase 25 C4)', () => {
  it('COHORT-AN-1: returns enrollmentsByMonth array', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/cohorts/insights')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.enrollmentsByMonth)).toBe(true);
    expect(res.body.data.enrollmentsByMonth.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.enrollmentsByMonth[0]).toHaveProperty('month');
    expect(res.body.data.enrollmentsByMonth[0]).toHaveProperty('count');
  });

  it('COHORT-AN-2: returns cohort completion rates', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/cohorts/insights')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data.cohorts)).toBe(true);
    expect(res.body.data.cohorts.length).toBeGreaterThanOrEqual(1);
    const cohort = res.body.data.cohorts[0];
    expect(cohort).toHaveProperty('cohortName');
    expect(cohort).toHaveProperty('totalMembers');
    expect(cohort).toHaveProperty('completionRate');
    expect(typeof cohort.completionRate).toBe('number');
  });

  it('COHORT-AN-3: ?format=csv returns CSV', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/cohorts/insights?format=csv')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Cohort');
  });
});

describe('GET /api/v1/analytics/sponsors/roi (Phase 25 C4)', () => {
  it('SPONSOR-ROI-1: returns sponsor breakdown with cost per completion', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/sponsors/roi')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.sponsors)).toBe(true);
    expect(res.body.data.sponsors.length).toBeGreaterThanOrEqual(1);
    const sponsor = res.body.data.sponsors[0];
    expect(sponsor).toHaveProperty('sponsorName');
    expect(sponsor).toHaveProperty('totalSpentCents');
    expect(sponsor).toHaveProperty('totalMembers');
    expect(sponsor).toHaveProperty('nftRate');
    expect(res.body.data).toHaveProperty('totals');
  });

  it('SPONSOR-ROI-2: ?from=&to= filters by date range', async () => {
    const future = '2099-01-01';
    const res = await request(app)
      .get(`/api/v1/analytics/sponsors/roi?from=${future}&to=${future}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.sponsors).toHaveLength(0);
  });
});
