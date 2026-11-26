/**
 * Gaps found by the mainnet single-role test, days 2 and 3 (25-26 Nov 2026):
 *  A. A learner in a Free cohort could not apply after the course became Paid only (TIER_NOT_AVAILABLE).
 *  B. Any instructor could approve or reject another course's certificate applications.
 *  C. Rejecting an application left its unpaid manual payment pending.
 *  D. A failed mint attempt stayed beside the minted credential after a successful retry.
 *  E. Teacher and employer dashboards counted a learner once per class or team.
 *  F. A teacher or employer was not told when a learner left their class or team.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import './setup.js';
import app from '../app.js';
import { execute, queryOne, query } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import * as mintModule from '../services/mintService.js';
import { isTierEnabled } from '../services/badgeService.js';

const WALLET = 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I';
const CONTRACT = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';

function createUserWithRole(roleId: string, roleName: string, wallet?: string) {
  const userId = uuidv4();
  const email = `${roleName}-${userId.slice(0, 8)}@test.com`;
  execute(
    "INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, '$2a$10$test', 'student', ?, ?)",
    [userId, `Test ${roleName}`, email, wallet ?? null, wallet ? 'linked' : 'none'],
  );
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  const token = generateToken({ userId, email, role: 'student' as never });
  return { userId, email, token };
}

function createCourse(lecturerId?: string) {
  const id = uuidv4();
  const code = `D3-${id.slice(0, 8).toUpperCase()}`;
  execute(
    "INSERT INTO courses (id, title, course_code, sections, approval_status) VALUES (?, ?, ?, '[]', 'approved')",
    [id, `Course ${id.slice(0, 6)}`, code],
  );
  if (lecturerId) execute('INSERT INTO course_lecturers (course_id, user_id) VALUES (?, ?)', [id, lecturerId]);
  return { id, code };
}

function pendingApplication(userId: string, courseId: string, tier = 'paid') {
  const appId = uuidv4();
  execute(
    "INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, applied_at) VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'))",
    [appId, userId, courseId, WALLET, tier],
  );
  return appId;
}

afterEach(() => { delete process.env.NFT_CONTRACT_ID; vi.restoreAllMocks(); });

describe('A: a Free cohort does not block applying after the course becomes Paid only', () => {
  it('isTierEnabled follows the course tier setting', () => {
    expect(isTierEnabled('free', 'paid_only')).toBe(false);
    expect(isTierEnabled('paid', 'paid_only')).toBe(true);
    expect(isTierEnabled('free', 'both')).toBe(true);
    expect(isTierEnabled('paid', 'free_only')).toBe(false);
  });

  it('reports no sponsored tier when the cohort tier is no longer offered', async () => {
    const learner = createUserWithRole('role_student', 'learner', WALLET);
    const sponsor = createUserWithRole('role_sponsor', 'sponsor');
    const course = createCourse();
    execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [learner.userId, course.code]);
    const cohortId = uuidv4();
    execute("INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier) VALUES (?, 'Free cohort', ?, ?, 'free')",
      [cohortId, sponsor.userId, course.id]);
    execute('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)', [cohortId, learner.userId]);

    execute("INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, tiers_enabled) VALUES (?, ?, 100, 'USD', 1, 'free_only')",
      [uuidv4(), course.id]);
    const whileFree = await request(app).get(`/api/v1/courses/${course.id}/tiers`).set('Authorization', `Bearer ${learner.token}`);
    expect(whileFree.body.data.sponsoredTier).toBe('free');

    execute("UPDATE course_pricing SET tiers_enabled = 'paid_only' WHERE course_id = ?", [course.id]);
    const afterPaid = await request(app).get(`/api/v1/courses/${course.id}/tiers`).set('Authorization', `Bearer ${learner.token}`);
    expect(afterPaid.status).toBe(200);
    expect(afterPaid.body.data.tiersEnabled).toBe('paid_only');
    expect(afterPaid.body.data.sponsoredTier).toBeNull();

    // Applying without naming a tier now picks Paid instead of the cohort's Free tier.
    const apply = await request(app).post(`/api/v1/courses/${course.id}/completions/apply`)
      .set('Authorization', `Bearer ${learner.token}`).send({});
    expect(apply.body?.error?.code).not.toBe('TIER_NOT_AVAILABLE');
    if (apply.status === 201) expect(apply.body.data.selectedTier).toBe('paid');
  });
});

describe('B: certificate decisions need the course', () => {
  it("refuses another course's instructor and allows the course's own lecturer", async () => {
    const lecturerA = createUserWithRole('role_instructor', 'instructor-a');
    const lecturerB = createUserWithRole('role_instructor', 'instructor-b');
    const learner = createUserWithRole('role_student', 'learner', WALLET);
    const learner2 = createUserWithRole('role_student', 'learner2', 'GAPPVKXWTESTWALLETSECONDLEARNERAAAAAAAAAAAAAAAAAAAAA3OLK');
    const course = createCourse(lecturerA.userId);
    const app1 = pendingApplication(learner.userId, course.id);
    const app2 = pendingApplication(learner2.userId, course.id);

    const byB = await request(app).patch(`/api/v1/courses/${course.id}/completions/applications/${app1}/approve`)
      .set('Authorization', `Bearer ${lecturerB.token}`).send({});
    expect(byB.status).toBe(403);
    const rejectByB = await request(app).patch(`/api/v1/courses/${course.id}/completions/applications/${app2}/reject`)
      .set('Authorization', `Bearer ${lecturerB.token}`).send({ reason: 'not mine' });
    expect(rejectByB.status).toBe(403);
    expect(queryOne<{ status: string }>('SELECT status FROM course_nft_applications WHERE id = ?', [app1])?.status).toBe('pending');

    const byA = await request(app).patch(`/api/v1/courses/${course.id}/completions/applications/${app1}/approve`)
      .set('Authorization', `Bearer ${lecturerA.token}`).send({});
    expect(byA.status).toBe(200);
  });
});

describe('C: rejecting closes the unpaid manual payment', () => {
  it('fails a pending manual payment but leaves a Paystack checkout alone', async () => {
    const lecturer = createUserWithRole('role_instructor', 'instructor');
    const learner = createUserWithRole('role_student', 'learner', WALLET);
    const course = createCourse(lecturer.userId);
    const appId = pendingApplication(learner.userId, course.id);
    const manualId = uuidv4();
    const paystackId = uuidv4();
    execute("INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status) VALUES (?, ?, ?, ?, 100, 'USD', 'manual', 'pending')",
      [manualId, learner.userId, course.id, appId]);
    execute("INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status) VALUES (?, ?, ?, ?, 100, 'USD', 'paystack', 'pending')",
      [paystackId, learner.userId, course.id, appId]);

    const res = await request(app).patch(`/api/v1/courses/${course.id}/completions/applications/${appId}/reject`)
      .set('Authorization', `Bearer ${lecturer.token}`).send({ reason: 'Please re-check your assignment' });
    expect(res.status).toBe(200);
    expect(queryOne<{ status: string }>('SELECT status FROM payments WHERE id = ?', [manualId])?.status).toBe('failed');
    expect(queryOne<{ status: string }>('SELECT status FROM payments WHERE id = ?', [paystackId])?.status).toBe('pending');
  });
});

describe('D: a successful retry supersedes the failed mint record', () => {
  it('leaves one live credential for the application', async () => {
    process.env.NFT_CONTRACT_ID = CONTRACT;
    const admin = createUserWithRole('role_admin', 'admin');
    execute("UPDATE users SET role = 'admin' WHERE id = ?", [admin.userId]);
    const learner = createUserWithRole('role_student', 'learner', WALLET);
    const course = createCourse();
    execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [learner.userId, course.code]);
    const appId = uuidv4();
    execute(
      "INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, applied_at) VALUES (?, ?, ?, ?, 'approved', 'paid', datetime('now'))",
      [appId, learner.userId, course.id, WALLET],
    );
    const failedId = uuidv4();
    execute(
      "INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, error, contract_id, network, course_id, application_id) VALUES (?, ?, NULL, ?, 'failed', 'Transaction not confirmed: status=NOT_FOUND', ?, 'testnet', ?, ?)",
      [failedId, learner.userId, WALLET, CONTRACT, course.id, appId],
    );
    vi.spyOn(mintModule, 'mintCredential').mockResolvedValue({ txHash: 'a'.repeat(64) } as never);

    const res = await request(app).post(`/api/v1/courses/${course.id}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const live = query<{ mint_status: string }>(
      'SELECT mint_status FROM nft_credentials WHERE application_id = ? AND is_superseded = 0', [appId]);
    expect(live.map(r => r.mint_status)).toEqual(['minted']);
    expect(queryOne<{ is_superseded: number }>('SELECT is_superseded FROM nft_credentials WHERE id = ?', [failedId])?.is_superseded).toBe(1);
  });
});

describe('E and F: classes and teams', () => {
  function groupWith(ownerId: string, type: 'class' | 'team', members: string[]) {
    const id = uuidv4();
    execute('INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)', [id, `${type} ${id.slice(0, 4)}`, type, ownerId]);
    for (const m of members) execute('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)', [id, m]);
    return id;
  }

  it('counts each learner once on the teacher dashboard', async () => {
    const teacher = createUserWithRole('role_teacher', 'teacher');
    const a = createUserWithRole('role_student', 'a');
    const b = createUserWithRole('role_student', 'b');
    groupWith(teacher.userId, 'class', [a.userId, b.userId]);
    groupWith(teacher.userId, 'class', [a.userId, b.userId]);
    const res = await request(app).get('/api/v1/teacher/dashboard').set('Authorization', `Bearer ${teacher.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalClasses).toBe(2);
    expect(res.body.data.totalStudents).toBe(2);
  });

  it('counts each member once on the employer dashboard', async () => {
    const employer = createUserWithRole('role_employer', 'employer');
    const a = createUserWithRole('role_student', 'a');
    groupWith(employer.userId, 'team', [a.userId]);
    groupWith(employer.userId, 'team', [a.userId]);
    const res = await request(app).get('/api/v1/employer/dashboard').set('Authorization', `Bearer ${employer.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalMembers).toBe(1);
  });

  it('tells the employer when a learner leaves the team', async () => {
    const employer = createUserWithRole('role_employer', 'employer');
    const learner = createUserWithRole('role_student', 'learner');
    const teamId = groupWith(employer.userId, 'team', [learner.userId]);
    const res = await request(app).delete(`/api/v1/students/me/groups/${teamId}`).set('Authorization', `Bearer ${learner.token}`);
    expect(res.status).toBe(200);
    const note = queryOne<{ title: string; body: string }>(
      "SELECT title, body FROM notifications WHERE user_id = ? AND type = 'group_member_left'", [employer.userId]);
    expect(note?.title).toBe('A learner left your team');
    expect(note?.body).toContain('Test learner');
  });
});
