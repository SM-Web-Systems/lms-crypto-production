/**
 * Owner decision 2026-11-21: a lecturer/admin approving a TA grade has the same
 * side effects as grading directly — the linked lesson is completed and the
 * grade_approved reward trigger fires (once). A sent-back grade triggers nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import './setup.js';
import app from '../app.js';
import { db, execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { createReward, fundReward, activateReward, getRewardAllocations } from '../services/rewards/rewardService.js';

function createUserWithRole(roleId: string, roleName: string) {
  const userId = uuidv4();
  const email = `${roleName}-${userId.slice(0, 8)}@test.com`;
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
    [userId, `Test ${roleName}`, email],
  );
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  return { userId, token: generateToken({ userId, email, role: 'student' as any }) };
}

describe('TA grade approval applies the direct-grade side effects', () => {
  let lecturer: { userId: string; token: string };
  let ta: { userId: string; token: string };
  let studentUserId: string;
  let courseId: string;
  let submissionId: string;
  let rewardId: string;
  let sponsorId: string;

  beforeEach(() => {
    lecturer = createUserWithRole('role_instructor', 'lecturer');
    ta = createUserWithRole('role_ta', 'ta');
    const student = createUserWithRole('role_student', 'student');
    studentUserId = student.userId;

    courseId = uuidv4();
    execute(
      'INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, ?, ?, ?, ?)',
      [courseId, 'TA Course', 'desc', `TA-${courseId.slice(0, 6)}`,
        JSON.stringify([{ id: 'sec-1', title: 'Week 1', items: [{ id: 'item1', title: 'Essay', type: 'assignment' }] }])],
    );
    execute('INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, lecturer.userId, lecturer.userId]);
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, ta.userId, lecturer.userId]);

    const studentRecordId = uuidv4();
    execute(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'Learner', ?, ?, 'CS', 1)",
      [studentRecordId, studentUserId, `l-${studentUserId.slice(0, 8)}@test.com`, `ENR-${studentRecordId.slice(0, 8)}`],
    );
    submissionId = uuidv4();
    execute(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, course_id, item_id, status) VALUES (?, ?, 'Essay', 'desc', 'f.pdf', 512, '/tmp/f.pdf', ?, 'item1', 'pending')",
      [submissionId, studentRecordId, courseId],
    );

    // An active grade reward whose audience includes the learner.
    sponsorId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'admin')").run(sponsorId, `${sponsorId}@test.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');
    const cohortId = uuidv4();
    db.prepare("INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')").run(cohortId, sponsorId, courseId);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentUserId);
    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId, rewardType: 'grade', amountStroops: '5000000',
      autoRelease: false, idempotencyKey: `idem-${uuidv4()}`,
    });
    const funderId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Funder', ?, 'hash', 'admin')").run(funderId, `${funderId}@test.com`);
    fundReward(reward.id, funderId, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsorId, `act-${uuidv4()}`);
    rewardId = reward.id;
  });

  const taGrades = () => request(app)
    .post(`/api/v1/ta/submissions/${submissionId}/grade`)
    .set('Authorization', `Bearer ${ta.token}`)
    .send({ status: 'approved', feedback: 'Well argued' });
  const approve = (token = lecturer.token) => request(app)
    .post(`/api/v1/ta/submissions/${submissionId}/approve-grade`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  const completion = () => queryOne(
    'SELECT progress_pct FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?',
    [studentUserId, courseId, 'item1']);
  const eligibleCount = () => (db.prepare(
    "SELECT COUNT(*) AS n FROM reward_eligibility_events WHERE reward_id = ? AND student_user_id = ? AND event_type = 'grade_approved' AND result = 'eligible'",
  ).get(rewardId, studentUserId) as { n: number }).n;
  const learnerAllocation = () => getRewardAllocations(rewardId).find(a => a.student_user_id === studentUserId);

  it('TA-APPROVE-1: approval completes the lesson and makes the learner eligible for the grade reward once', async () => {
    expect((await taGrades()).status).toBe(200);
    // Nothing happens while the TA grade waits for approval.
    expect(completion()).toBeFalsy();
    expect(eligibleCount()).toBe(0);

    const res = await approve();
    expect(res.status).toBe(200);
    expect(completion()).toEqual({ progress_pct: 100 });
    expect(eligibleCount()).toBe(1);
    expect(learnerAllocation()!.status).toBe('eligible');

    const outbox = db.prepare(
      "SELECT event_data FROM reward_event_outbox WHERE event_type = 'grade_approved' AND event_source_id = ? AND student_user_id = ?",
    ).get(submissionId, studentUserId) as { event_data: string };
    expect(JSON.parse(outbox.event_data).reviewerId).toBe(lecturer.userId);
  });

  it('TA-APPROVE-2: approving twice pays once', async () => {
    await taGrades();
    expect((await approve()).status).toBe(200);
    expect((await approve()).status).toBe(400);
    expect(eligibleCount()).toBe(1);
    const outboxRows = (db.prepare(
      "SELECT COUNT(*) AS n FROM reward_event_outbox WHERE event_type = 'grade_approved' AND event_source_id = ?",
    ).get(submissionId) as { n: number }).n;
    expect(outboxRows).toBe(1);
  });

  it('TA-APPROVE-3: a sent-back grade completes nothing and pays nothing', async () => {
    await taGrades();
    const res = await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/reject-grade`)
      .set('Authorization', `Bearer ${lecturer.token}`)
      .send({ note: 'Too lenient' });
    expect(res.status).toBe(200);
    expect(completion()).toBeFalsy();
    expect(eligibleCount()).toBe(0);
    expect(db.prepare("SELECT 1 FROM reward_event_outbox WHERE event_source_id = ?").get(submissionId)).toBeFalsy();
  });

  it('TA-APPROVE-4: the TA cannot approve their own grade', async () => {
    await taGrades();
    expect((await approve(ta.token)).status).toBe(403);
    expect(completion()).toBeFalsy();
    expect(eligibleCount()).toBe(0);
  });

  it('TA-APPROVE-5: an admin who entered the TA grade cannot approve it themselves', async () => {
    const admin = createUserWithRole('role_admin', 'admin');
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, admin.userId, lecturer.userId]);
    const graded = await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/grade`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });
    expect(graded.status).toBe(200);
    expect((await approve(admin.token)).status).toBe(403);
    expect(completion()).toBeFalsy();
    expect(eligibleCount()).toBe(0);
  });

  it('TA-APPROVE-6: approving with status rejected completes nothing and pays nothing', async () => {
    await taGrades();
    const res = await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/approve-grade`)
      .set('Authorization', `Bearer ${lecturer.token}`)
      .send({ status: 'rejected' });
    expect(res.status).toBe(200);
    expect(completion()).toBeFalsy();
    expect(eligibleCount()).toBe(0);
  });

  it('TA-APPROVE-7: a grade entered by the reward creator does not pay that reward, even when someone else approves it', async () => {
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_ta');
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, sponsorId, lecturer.userId]);
    const creatorToken = generateToken({ userId: sponsorId, email: `${sponsorId}@test.com`, role: 'student' as any });
    const graded = await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/grade`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'approved' });
    expect(graded.status).toBe(200);
    expect((await approve()).status).toBe(200);
    expect(completion()).toEqual({ progress_pct: 100 });
    expect(eligibleCount()).toBe(0);
  });

  it('TA-APPROVE-8: a TA approval followed by a direct review of the same submission pays once', async () => {
    await taGrades();
    expect((await approve()).status).toBe(200);
    const review = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${lecturer.token}`)
      .send({ status: 'approved', feedback: 'Confirmed' });
    expect(review.status).toBe(200);
    expect(eligibleCount()).toBe(1);
  });
});
