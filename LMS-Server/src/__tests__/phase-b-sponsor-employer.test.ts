/**
 * Phase B — Sponsor + Employer Route Tests (TDD)
 *
 * B1-SCOPE-1: Sponsor can GET own cohorts only
 * B1-SCOPE-2: Sponsor cannot access admin-only endpoints
 * B3-IMPACT-1: GET /sponsor/impact-report returns aggregate stats (no PII)
 * B4-BILLING-1: Sponsor can view own billing
 * B5-TEAM-1: Employer can create/manage teams
 * B5-TEAM-2: Employer can add/remove team members
 * B5-WALLET-1: Employer cannot view student wallets (CI invariant test covers)
 * B6-BILLING-1: Employer can view own billing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import request from 'supertest';
import app from '../app.js';
import { execute, query, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { v4 as uuidv4 } from 'uuid';

// Helper: create user with RBAC role and return { userId, token }
function createUserWithRole(roleId: string, roleName: string) {
  const userId = uuidv4();
  const email = `${roleName}-${userId.slice(0, 8)}@test.com`;
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
    [userId, `Test ${roleName}`, email],
  );
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  const token = generateToken({ userId, email, role: 'student' as any });
  return { userId, email, token };
}

// Helper: create a course for use in cohorts/payments
function createCourse(): string {
  const courseId = uuidv4();
  execute(
    "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'Desc', ?)",
    [courseId, `CC-${courseId.slice(0, 8)}`],
  );
  return courseId;
}

describe('Phase B — Sponsor Routes', () => {
  let sponsor: { userId: string; token: string };
  let otherSponsor: { userId: string; token: string };
  let courseId: string;

  beforeEach(() => {
    sponsor = createUserWithRole('role_sponsor', 'sponsor');
    otherSponsor = createUserWithRole('role_sponsor', 'sponsor2');
    courseId = createCourse();
  });

  it('B1-SCOPE-1: Sponsor dashboard returns own cohort stats only', async () => {
    // Create cohort owned by sponsor
    const cohortId = uuidv4();
    execute(
      "INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, status) VALUES (?, 'My Cohort', ?, ?, 'active')",
      [cohortId, sponsor.userId, courseId],
    );

    // Create cohort owned by other sponsor
    const otherCohortId = uuidv4();
    execute(
      "INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, status) VALUES (?, 'Other Cohort', ?, ?, 'active')",
      [otherCohortId, otherSponsor.userId, courseId],
    );

    const res = await request(app)
      .get('/api/v1/sponsor/dashboard')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalCohorts).toBe(1);
    expect(res.body.data.activeCohorts).toBe(1);
    // Should only see own cohort
    expect(res.body.data.cohorts).toHaveLength(1);
    expect(res.body.data.cohorts[0].name).toBe('My Cohort');
  });

  it('B1-SCOPE-2: Sponsor cannot access admin user management', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${sponsor.token}`);

    // Should be 403 (no user.manage permission)
    expect(res.status).toBe(403);
  });

  it('B3-IMPACT-1: GET /sponsor/impact-report returns aggregate stats', async () => {
    const cohortId = uuidv4();
    execute(
      "INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, status) VALUES (?, 'Impact Cohort', ?, ?, 'active')",
      [cohortId, sponsor.userId, courseId],
    );

    // Add a member
    const student = createUserWithRole('role_student', 'student');
    execute('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)', [
      cohortId,
      student.userId,
    ]);

    const res = await request(app)
      .get('/api/v1/sponsor/impact-report')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalMembers).toBe(1);
    expect(typeof res.body.data.completionPct).toBe('number');
    // Should NOT contain student PII (name, email)
    const dataStr = JSON.stringify(res.body.data);
    expect(dataStr).not.toContain(student.email);
  });

  it('B4-BILLING-1: Sponsor can view own billing', async () => {
    // Create a payment
    execute(
      "INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status) VALUES (?, ?, ?, 5000, 'USD', 'manual', 'confirmed')",
      [uuidv4(), sponsor.userId, courseId],
    );

    const res = await request(app)
      .get('/api/v1/sponsor/billing')
      .set('Authorization', `Bearer ${sponsor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.payments[0].amount_cents).toBe(5000);
  });
});

describe('Phase B — Employer Routes', () => {
  let employer: { userId: string; token: string };
  let courseId: string;

  beforeEach(() => {
    employer = createUserWithRole('role_employer', 'employer');
    courseId = createCourse();
  });

  it('B5-TEAM-1: Employer can create and list teams', async () => {
    // Create team
    const createRes = await request(app)
      .post('/api/v1/employer/teams')
      .set('Authorization', `Bearer ${employer.token}`)
      .send({ name: 'Engineering Team' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.name).toBe('Engineering Team');
    expect(createRes.body.data.group_type).toBe('team');

    // List teams
    const listRes = await request(app)
      .get('/api/v1/employer/teams')
      .set('Authorization', `Bearer ${employer.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.teams).toHaveLength(1);
    expect(listRes.body.data.teams[0].name).toBe('Engineering Team');
  });

  it('B5-TEAM-2: Employer can add and remove team members', async () => {
    // Create team
    const teamId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Dev Team', 'team', ?)",
      [teamId, employer.userId],
    );

    // Create a student to add
    const student = createUserWithRole('role_student', 'student');

    // Add member
    const addRes = await request(app)
      .post(`/api/v1/employer/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${employer.token}`)
      .send({ userId: student.userId });

    expect(addRes.status).toBe(201);

    // Verify member was added
    const member = queryOne(
      'SELECT * FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [teamId, student.userId],
    );
    expect(member).not.toBeNull();

    // Remove member
    const removeRes = await request(app)
      .delete(`/api/v1/employer/teams/${teamId}/members/${student.userId}`)
      .set('Authorization', `Bearer ${employer.token}`);

    expect(removeRes.status).toBe(200);
    expect(removeRes.body.data.removed).toBe(true);

    // Verify member was removed
    const removedMember = queryOne(
      'SELECT * FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [teamId, student.userId],
    );
    expect(removedMember).toBeNull();
  });

  it('B5-TEAM-3: Employer can delete own team', async () => {
    const teamId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Old Team', 'team', ?)",
      [teamId, employer.userId],
    );

    const res = await request(app)
      .delete(`/api/v1/employer/teams/${teamId}`)
      .set('Authorization', `Bearer ${employer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const deleted = queryOne('SELECT id FROM user_groups WHERE id = ?', [teamId]);
    expect(deleted).toBeNull();
  });

  it('B5-TEAM-4: Employer cannot delete another employer\'s team', async () => {
    const otherEmployer = createUserWithRole('role_employer', 'employer2');
    const teamId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Other Team', 'team', ?)",
      [teamId, otherEmployer.userId],
    );

    const res = await request(app)
      .delete(`/api/v1/employer/teams/${teamId}`)
      .set('Authorization', `Bearer ${employer.token}`);

    expect(res.status).toBe(403);
  });

  it('B5-DASHBOARD-1: Employer dashboard shows team stats', async () => {
    // Create team with members
    const teamId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'My Team', 'team', ?)",
      [teamId, employer.userId],
    );
    const student = createUserWithRole('role_student', 'student');
    execute('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)', [
      teamId,
      student.userId,
    ]);

    const res = await request(app)
      .get('/api/v1/employer/dashboard')
      .set('Authorization', `Bearer ${employer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalTeams).toBe(1);
    expect(res.body.data.totalMembers).toBe(1);
  });

  it('B6-BILLING-1: Employer can view own billing', async () => {
    execute(
      "INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status) VALUES (?, ?, ?, 10000, 'USD', 'paystack', 'confirmed')",
      [uuidv4(), employer.userId, courseId],
    );

    const res = await request(app)
      .get('/api/v1/employer/billing')
      .set('Authorization', `Bearer ${employer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.payments[0].amount_cents).toBe(10000);
  });
});
