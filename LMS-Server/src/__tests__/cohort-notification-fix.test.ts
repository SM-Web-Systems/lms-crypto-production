/**
 * D3B1-13 / D3B1-14 — Cohort invite notification must query sponsor_cohorts
 * (not the non-existent "cohorts" table) and resolve the actual cohort name.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

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

function seedCohort(name: string, sponsorId: string, courseId: string) {
  const cohortId = uuidv4();
  db.exec(`
    INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, created_at)
    VALUES ('${cohortId}', '${name}', '${sponsorId}', '${courseId}', 'free', 'draft', datetime('now'));
  `);
  return cohortId;
}

describe('Cohort invite notification fix (D3B1-13, D3B1-14)', () => {
  let adminId: string;
  let adminToken: string;
  let studentId: string;
  let courseId: string;
  let cohortId: string;
  const cohortName = 'Acme Test Cohort';

  beforeEach(() => {
    adminId = seedUser('admin', `notif-admin-${Date.now()}`);
    adminToken = makeToken({ userId: adminId, email: `notif-admin-${Date.now()}@test.com`, role: 'admin' });
    studentId = seedUser('student', `notif-student-${Date.now()}`);
    courseId = seedCourse('Notification Test Course', `NTC-${Date.now()}`);
    cohortId = seedCohort(cohortName, adminId, courseId);
  });

  it('D3B1-13: invite endpoint returns 200 (notification query does not crash)', async () => {
    const studentEmail = db.prepare('SELECT email FROM users WHERE id = ?').get(studentId) as { email: string };

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ emails: [studentEmail.email] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('D3B1-14: notification body contains actual cohort name, not "a cohort"', async () => {
    const studentEmail = db.prepare('SELECT email FROM users WHERE id = ?').get(studentId) as { email: string };

    await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ emails: [studentEmail.email] });

    // Check that notification was created with the real cohort name
    const notification = db.prepare(
      `SELECT body FROM notifications WHERE user_id = ? AND type = 'cohort_invited' ORDER BY created_at DESC LIMIT 1`
    ).get(studentId) as { body: string } | undefined;

    expect(notification).toBeDefined();
    expect(notification!.body).toContain(cohortName);
    expect(notification!.body).not.toContain('"a cohort"');
  });
});
