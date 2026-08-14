import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import {
  produceOutboxEvent,
  processPendingEvents,
  evaluateEligibility,
} from '../services/rewards/rewardEligibilityService.js';
import {
  createReward,
  fundReward,
  activateReward,
  getRewardAllocations,
} from '../services/rewards/rewardService.js';

function createTestToken(userId: string, role: string): string {
  return generateToken({ userId, email: `${userId}@test.com`, role });
}

/** Install a BEFORE INSERT trigger on reward_event_outbox that aborts for a specific event_source_id. */
function installOutboxFailTrigger(targetSourceId: string): void {
  db.exec(`
    CREATE TRIGGER test_outbox_fail BEFORE INSERT ON reward_event_outbox
    WHEN NEW.event_source_id = '${targetSourceId}'
    BEGIN SELECT RAISE(ABORT, 'Injected outbox failure for atomicity test'); END
  `);
}

function removeOutboxFailTrigger(): void {
  db.exec('DROP TRIGGER IF EXISTS test_outbox_fail');
}

function seedSponsorWithCohort(): {
  sponsorId: string;
  studentId: string;
  cohortId: string;
  courseId: string;
} {
  const sponsorId = uuidv4();
  const studentId = uuidv4();
  const cohortId = uuidv4();
  const courseId = uuidv4();

  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'admin')"
  ).run(sponsorId, `${sponsorId}@test.com`);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(
    sponsorId,
    'role_sponsor'
  );

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(
    cohortId,
    studentId
  );

  return { sponsorId, studentId, cohortId, courseId };
}

function createActiveReward(
  sponsorId: string,
  cohortId: string,
  opts?: {
    autoRelease?: boolean;
    rewardType?: string;
    amountStroops?: string;
    eligibilityConfig?: string;
  }
): string {
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: opts?.rewardType ?? 'custom',
    amountStroops: opts?.amountStroops ?? '5000000',
    autoRelease: opts?.autoRelease ?? false,
    eligibilityConfig: opts?.eligibilityConfig,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  fundReward(reward.id, sponsorId, { type: 'admin_grant' }, `fund-${uuidv4()}`);
  activateReward(reward.id, sponsorId, `act-${uuidv4()}`);
  return reward.id;
}

describe('R12-ATOMIC: Outbox atomicity with primary writes', () => {
  afterEach(() => {
    removeOutboxFailTrigger();
  });

  // ─── Lesson completion atomicity ───────────────────────────────────────────

  it('R-ATOM-1: lesson completion and outbox event are committed together', async () => {
    const userId = uuidv4();
    const courseId = uuidv4();
    const courseCode = `CC-${courseId.slice(0, 8)}`;
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(userId, `${userId}@test.com`);
    db.prepare(
      `INSERT INTO courses (id, title, description, course_code, sections)
       VALUES (?, 'Test', 'desc', ?, ?)`
    ).run(courseId, courseCode, JSON.stringify([
      { id: 'sec1', title: 'Section 1', items: [{ id: 'item1', title: 'Item 1', type: 'text', content: '' }] }
    ]));
    db.prepare('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)').run(userId, courseCode);

    const token = createTestToken(userId, 'student');
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item1/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const completion = db.prepare(
      'SELECT * FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(userId, courseId, 'item1');
    expect(completion).toBeDefined();

    const outboxEvent = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE student_user_id = ? AND event_type = 'course_completion' AND event_source_id = ?`
    ).get(userId, courseId);
    expect(outboxEvent).toBeDefined();
  });

  it('R-ATOM-3: if outbox insert fails, lesson completion is rolled back', async () => {
    const userId = uuidv4();
    const courseId = uuidv4();
    const courseCode = `CC-${courseId.slice(0, 8)}`;
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(userId, `${userId}@test.com`);
    db.prepare(
      `INSERT INTO courses (id, title, description, course_code, sections)
       VALUES (?, 'Test', 'desc', ?, ?)`
    ).run(courseId, courseCode, JSON.stringify([
      { id: 'sec1', title: 'Section 1', items: [{ id: 'item1', title: 'Item 1', type: 'text', content: '' }] }
    ]));
    db.prepare('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)').run(userId, courseCode);

    // Inject failure: trigger ABORTs outbox insert for this courseId
    installOutboxFailTrigger(courseId);

    const token = createTestToken(userId, 'student');
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item1/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);

    // Primary write must be rolled back
    const completion = db.prepare(
      'SELECT * FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(userId, courseId, 'item1');
    expect(completion).toBeUndefined();

    // Outbox event must not exist
    const outboxEvent = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE student_user_id = ? AND event_source_id = ?`
    ).get(userId, courseId);
    expect(outboxEvent).toBeUndefined();
  });

  it('R-ATOM-4: replaying lesson completion is idempotent (no duplicate events)', async () => {
    const userId = uuidv4();
    const courseId = uuidv4();
    const courseCode = `CC-${courseId.slice(0, 8)}`;
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(userId, `${userId}@test.com`);
    db.prepare(
      `INSERT INTO courses (id, title, description, course_code, sections)
       VALUES (?, 'Test', 'desc', ?, ?)`
    ).run(courseId, courseCode, JSON.stringify([
      { id: 'sec1', title: 'Section 1', items: [{ id: 'item1', title: 'Item 1', type: 'text', content: '' }] }
    ]));
    db.prepare('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)').run(userId, courseCode);

    const token = createTestToken(userId, 'student');

    // First request
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item1/complete`)
      .set('Authorization', `Bearer ${token}`);

    // Replay
    const res2 = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item1/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(res2.status).toBe(200);

    // Exactly one outbox event
    const count = db.prepare(
      `SELECT COUNT(*) as cnt FROM reward_event_outbox
       WHERE student_user_id = ? AND event_type = 'course_completion' AND event_source_id = ?`
    ).get(userId, courseId) as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  // ─── Quiz pass atomicity ──────────────────────────────────────────────────

  it('R-ATOM-2: quiz submission and outbox event are committed together', async () => {
    const userId = uuidv4();
    const quizId = uuidv4();
    const courseId = uuidv4();

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(userId, `${userId}@test.com`);
    db.prepare(
      "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Quiz Course', 'desc', ?)"
    ).run(courseId, `QC-${courseId.slice(0, 8)}`);
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Q', ?, 70, ?)"
    ).run(quizId, JSON.stringify([
      { id: 'q1', question: 'What is 2+2?', type: 'multiple_choice', options: ['3', '4', '5'], correctIndex: 1 }
    ]), courseId);

    const token = createTestToken(userId, 'student');
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { q1: '4' } });

    expect(res.status).toBe(201);
    expect(res.body.data.passed).toBe(true);

    const outboxEvent = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE student_user_id = ? AND event_type = 'quiz_pass' AND event_source_id = ?`
    ).get(userId, quizId);
    expect(outboxEvent).toBeDefined();
  });

  it('R-ATOM-5: if outbox insert fails, quiz completion is rolled back', async () => {
    const userId = uuidv4();
    const quizId = uuidv4();
    const courseId = uuidv4();

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(userId, `${userId}@test.com`);
    db.prepare(
      "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Quiz Course', 'desc', ?)"
    ).run(courseId, `QC-${courseId.slice(0, 8)}`);
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Q', ?, 70, ?)"
    ).run(quizId, JSON.stringify([
      { id: 'q1', question: 'What is 2+2?', type: 'multiple_choice', options: ['3', '4', '5'], correctIndex: 1 }
    ]), courseId);

    // Inject failure: trigger ABORTs outbox insert for this quizId
    installOutboxFailTrigger(quizId);

    const token = createTestToken(userId, 'student');
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { q1: '4' } });

    expect(res.status).toBe(500);

    // Quiz completion must be rolled back
    const completion = db.prepare(
      'SELECT * FROM quiz_completions WHERE quiz_id = ? AND user_id = ?'
    ).get(quizId, userId);
    expect(completion).toBeUndefined();

    // Outbox event must not exist
    const outboxEvent = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE student_user_id = ? AND event_source_id = ?`
    ).get(userId, quizId);
    expect(outboxEvent).toBeUndefined();
  });

  it('R-ATOM-6: failed quiz creates no outbox event', async () => {
    const userId = uuidv4();
    const quizId = uuidv4();
    const courseId = uuidv4();

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(userId, `${userId}@test.com`);
    db.prepare(
      "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Quiz Course', 'desc', ?)"
    ).run(courseId, `QC-${courseId.slice(0, 8)}`);
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Q', ?, 70, ?)"
    ).run(quizId, JSON.stringify([
      { id: 'q1', question: 'What is 2+2?', type: 'multiple_choice', options: ['3', '4', '5'], correctIndex: 1 }
    ]), courseId);

    const token = createTestToken(userId, 'student');
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { q1: '3' } }); // Wrong answer

    expect(res.status).toBe(201);
    expect(res.body.data.passed).toBe(false);

    // No outbox event for failed quiz
    const outboxEvent = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE student_user_id = ? AND event_type = 'quiz_pass'`
    ).get(userId);
    expect(outboxEvent).toBeUndefined();
  });

  it('R-ATOM-7: duplicate quiz submission is idempotent (no duplicate events)', async () => {
    const userId = uuidv4();
    const quizId = uuidv4();
    const courseId = uuidv4();

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(userId, `${userId}@test.com`);
    db.prepare(
      "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Quiz Course', 'desc', ?)"
    ).run(courseId, `QC-${courseId.slice(0, 8)}`);
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Q', ?, 70, ?)"
    ).run(quizId, JSON.stringify([
      { id: 'q1', question: 'What is 2+2?', type: 'multiple_choice', options: ['3', '4', '5'], correctIndex: 1 }
    ]), courseId);

    const token = createTestToken(userId, 'student');

    // First submission
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { q1: '4' } });

    // Replay
    const res2 = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { q1: '4' } });

    expect(res2.status).toBe(201);

    // Exactly one outbox event
    const count = db.prepare(
      `SELECT COUNT(*) as cnt FROM reward_event_outbox
       WHERE student_user_id = ? AND event_type = 'quiz_pass' AND event_source_id = ?`
    ).get(userId, quizId) as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  // ─── Grade approval atomicity ─────────────────────────────────────────────

  it('R-ATOM-8: approved grade creates outbox event atomically', async () => {
    const adminId = uuidv4();
    const studentUserId = uuidv4();
    const studentId = uuidv4();
    const courseId = uuidv4();
    const itemId = uuidv4();
    const submissionId = uuidv4();
    const code = `GA-${uuidv4().slice(0, 6)}`;

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
    ).run(adminId, `${adminId}@test.com`);
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
    ).run(studentUserId, `${studentUserId}@test.com`);
    db.prepare(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'Student', ?, 'ENR001', 'CS', 1)"
    ).run(studentId, studentUserId, `${studentUserId}@test.com`);
    db.prepare(
      `INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Grade Course', 'desc', ?, ?)`
    ).run(courseId, code, JSON.stringify([{ id: 'sec1', title: 'S1', items: [{ id: itemId, type: 'assignment', title: 'A1' }] }]));
    db.prepare(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id, item_id) VALUES (?, ?, 'Work', 'desc', 'f.pdf', 1024, '/tmp/f.pdf', 'pending', ?, ?)"
    ).run(submissionId, studentId, courseId, itemId);

    const token = createTestToken(adminId, 'admin');
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'Good' });

    expect(res.status).toBe(200);

    const outboxEvent = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE student_user_id = ? AND event_type = 'grade_approved' AND event_source_id = ?`
    ).get(studentUserId, submissionId);
    expect(outboxEvent).toBeDefined();
  });

  it('R-ATOM-9: rejected grade creates no outbox event', async () => {
    const adminId = uuidv4();
    const studentUserId = uuidv4();
    const studentId = uuidv4();
    const submissionId = uuidv4();

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
    ).run(adminId, `${adminId}@test.com`);
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
    ).run(studentUserId, `${studentUserId}@test.com`);
    db.prepare(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'Student', ?, 'ENR002', 'CS', 1)"
    ).run(studentId, studentUserId, `${studentUserId}@test.com`);
    db.prepare(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status) VALUES (?, ?, 'Work', 'desc', 'f.pdf', 1024, '/tmp/f.pdf', 'pending')"
    ).run(submissionId, studentId);

    const token = createTestToken(adminId, 'admin');
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'rejected', feedback: 'Needs improvement' });

    expect(res.status).toBe(200);

    const outboxEvent = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE student_user_id = ? AND event_type = 'grade_approved'`
    ).get(studentUserId);
    expect(outboxEvent).toBeUndefined();
  });

  it('R-ATOM-10: if outbox insert fails, grade update is rolled back', async () => {
    const adminId = uuidv4();
    const studentUserId = uuidv4();
    const studentId = uuidv4();
    const submissionId = uuidv4();

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
    ).run(adminId, `${adminId}@test.com`);
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
    ).run(studentUserId, `${studentUserId}@test.com`);
    db.prepare(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'Student', ?, 'ENR003', 'CS', 1)"
    ).run(studentId, studentUserId, `${studentUserId}@test.com`);
    db.prepare(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status) VALUES (?, ?, 'Work', 'desc', 'f.pdf', 1024, '/tmp/f.pdf', 'pending')"
    ).run(submissionId, studentId);

    // Inject failure: trigger ABORTs outbox insert for this submissionId
    installOutboxFailTrigger(submissionId);

    const token = createTestToken(adminId, 'admin');
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'Good' });

    expect(res.status).toBe(500);

    // Submission status must remain 'pending' (rolled back)
    const sub = db.prepare('SELECT status FROM submissions WHERE id = ?').get(submissionId) as { status: string };
    expect(sub.status).toBe('pending');

    // Outbox event must not exist
    const outboxEvent = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE event_source_id = ?`
    ).get(submissionId);
    expect(outboxEvent).toBeUndefined();
  });

  it('R-ATOM-11: duplicate grade approval is idempotent (no duplicate events)', async () => {
    const adminId = uuidv4();
    const studentUserId = uuidv4();
    const studentId = uuidv4();
    const submissionId = uuidv4();

    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
    ).run(adminId, `${adminId}@test.com`);
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
    ).run(studentUserId, `${studentUserId}@test.com`);
    db.prepare(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'Student', ?, 'ENR004', 'CS', 1)"
    ).run(studentId, studentUserId, `${studentUserId}@test.com`);
    db.prepare(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status) VALUES (?, ?, 'Work', 'desc', 'f.pdf', 1024, '/tmp/f.pdf', 'pending')"
    ).run(submissionId, studentId);

    const token = createTestToken(adminId, 'admin');

    // First approval
    await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'Good' });

    // Re-approve (replay)
    const res2 = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'Still good' });

    expect(res2.status).toBe(200);

    // Exactly one outbox event (INSERT OR IGNORE deduplication)
    const count = db.prepare(
      `SELECT COUNT(*) as cnt FROM reward_event_outbox
       WHERE student_user_id = ? AND event_type = 'grade_approved' AND event_source_id = ?`
    ).get(studentUserId, submissionId) as { cnt: number };
    expect(count.cnt).toBe(1);
  });
});

describe('R12: Outbox and Eligibility Processing', () => {
  it('R-ELIG-1: produceOutboxEvent inserts pending event', () => {
    const studentId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(studentId, `${studentId}@test.com`);

    produceOutboxEvent('course_completion', 'course-123', studentId);

    const row = db.prepare(
      `SELECT * FROM reward_event_outbox WHERE student_user_id = ? AND event_type = 'course_completion'`
    ).get(studentId) as { status: string; event_source_id: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.status).toBe('pending');
    expect(row!.event_source_id).toBe('course-123');
  });

  it('R-ELIG-2: duplicate outbox event is silently ignored', () => {
    const studentId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(studentId, `${studentId}@test.com`);

    produceOutboxEvent('quiz_pass', 'quiz-1', studentId);
    produceOutboxEvent('quiz_pass', 'quiz-1', studentId); // duplicate

    const count = db.prepare(
      `SELECT COUNT(*) as cnt FROM reward_event_outbox WHERE student_user_id = ? AND event_type = 'quiz_pass' AND event_source_id = 'quiz-1'`
    ).get(studentId) as { cnt: number };

    expect(count.cnt).toBe(1);
  });

  it('R-ELIG-3: processPendingEvents marks allocation eligible', () => {
    const { sponsorId, studentId, cohortId } = seedSponsorWithCohort();
    const rewardId = createActiveReward(sponsorId, cohortId);

    produceOutboxEvent('course_completion', 'course-abc', studentId);
    const result = processPendingEvents();

    expect(result.processed).toBeGreaterThanOrEqual(1);

    const allocations = getRewardAllocations(rewardId);
    const studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc).toBeDefined();
    expect(studentAlloc!.status).toBe('eligible');
  });

  it('R-ELIG-4: auto-release triggers when auto_release=1 and below threshold', () => {
    const { sponsorId, studentId, cohortId } = seedSponsorWithCohort();
    const rewardId = createActiveReward(sponsorId, cohortId, {
      autoRelease: true,
      amountStroops: '5000000',
    });

    produceOutboxEvent('course_completion', `course-${uuidv4()}`, studentId);
    processPendingEvents();

    const allocations = getRewardAllocations(rewardId);
    const studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc).toBeDefined();
    expect(studentAlloc!.status).toBe('released');
  });

  it('R-ELIG-5: auto-release skipped when above high-value threshold', () => {
    const { sponsorId, studentId, cohortId } = seedSponsorWithCohort();
    const rewardId = createActiveReward(sponsorId, cohortId, {
      autoRelease: true,
      amountStroops: '1000000001',
    });

    produceOutboxEvent('course_completion', `course-${uuidv4()}`, studentId);
    processPendingEvents();

    const allocations = getRewardAllocations(rewardId);
    const studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc).toBeDefined();
    expect(studentAlloc!.status).toBe('eligible'); // NOT released
  });

  it('R-ELIG-6: course_completion reward ignores quiz_pass events', () => {
    const { sponsorId, studentId, cohortId } = seedSponsorWithCohort();
    const rewardId = createActiveReward(sponsorId, cohortId, {
      rewardType: 'course_completion',
    });

    produceOutboxEvent('quiz_pass', `quiz-${uuidv4()}`, studentId);
    processPendingEvents();

    const allocations = getRewardAllocations(rewardId);
    const studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc).toBeDefined();
    expect(studentAlloc!.status).toBe('pending'); // NOT eligible
  });

  it('R-ELIG-7: grade_approved rejected when reviewer is reward creator', () => {
    const { sponsorId, studentId, cohortId } = seedSponsorWithCohort();
    createActiveReward(sponsorId, cohortId, { rewardType: 'grade' });

    produceOutboxEvent('grade_approved', `sub-${uuidv4()}`, studentId, {
      reviewerId: sponsorId,
    });
    processPendingEvents();

    const events = db
      .prepare(
        `SELECT result FROM reward_eligibility_events WHERE student_user_id = ?`
      )
      .all(studentId) as Array<{ result: string }>;

    expect(events.some((e) => e.result === 'ineligible')).toBe(true);
  });

  it('R-ELIG-8: non-audience student events are ignored', () => {
    const { sponsorId, cohortId } = seedSponsorWithCohort();
    const outsiderId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Outsider', ?, 'hash', 'student')"
    ).run(outsiderId, `${outsiderId}@test.com`);

    createActiveReward(sponsorId, cohortId);

    produceOutboxEvent('course_completion', `course-${uuidv4()}`, outsiderId);
    const result = processPendingEvents();

    expect(result.processed).toBeGreaterThanOrEqual(1);
    const eligEvents = db
      .prepare(
        `SELECT * FROM reward_eligibility_events WHERE student_user_id = ?`
      )
      .all(outsiderId);
    expect(eligEvents.length).toBe(0);
  });

  it('R-ELIG-9: completed event is not reprocessed (idempotent)', () => {
    const { sponsorId, studentId, cohortId } = seedSponsorWithCohort();
    createActiveReward(sponsorId, cohortId);

    const sourceId = `course-${uuidv4()}`;
    produceOutboxEvent('course_completion', sourceId, studentId);
    processPendingEvents();

    // Manually reset event to pending to simulate redelivery
    db.prepare(
      `UPDATE reward_event_outbox SET status = 'pending'
       WHERE event_type = 'course_completion' AND event_source_id = ? AND student_user_id = ?`
    ).run(sourceId, studentId);

    processPendingEvents();

    // Should still have only one eligibility event (idempotent via composite unique)
    const eligEvents = db
      .prepare(
        `SELECT * FROM reward_eligibility_events
         WHERE student_user_id = ? AND event_source_id = ?`
      )
      .all(studentId, sourceId);
    expect(eligEvents.length).toBe(1);
  });

  it('R-ELIG-10: attempt_count increments on each processing', () => {
    const studentId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'student')"
    ).run(studentId, `${studentId}@test.com`);

    const eventId = uuidv4();
    const sourceId = `src-${uuidv4()}`;
    db.prepare(
      `INSERT INTO reward_event_outbox (id, event_type, event_source_id, student_user_id, event_data, status)
       VALUES (?, 'course_completion', ?, ?, NULL, 'pending')`
    ).run(eventId, sourceId, studentId);

    processPendingEvents();

    const row = db
      .prepare('SELECT status, attempt_count FROM reward_event_outbox WHERE id = ?')
      .get(eventId) as { status: string; attempt_count: number };
    expect(row.attempt_count).toBe(1);
    expect(row.status).toBe('completed');
  });

  it('R-ELIG-11: quiz_pass for custom reward triggers eligibility', () => {
    const { sponsorId, studentId, cohortId } = seedSponsorWithCohort();
    createActiveReward(sponsorId, cohortId); // custom type

    produceOutboxEvent('quiz_pass', `quiz-${uuidv4()}`, studentId);
    processPendingEvents();

    const eligEvents = db
      .prepare(
        `SELECT result FROM reward_eligibility_events WHERE student_user_id = ?`
      )
      .all(studentId) as Array<{ result: string }>;
    expect(eligEvents.some((e) => e.result === 'eligible')).toBe(true);
  });

  it('R-ELIG-12: grade_approved for grade reward with valid reviewer triggers eligibility', () => {
    const { sponsorId, studentId, cohortId } = seedSponsorWithCohort();

    // Create a separate instructor user as reviewer
    const instructorId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Instructor', ?, 'hash', 'admin')"
    ).run(instructorId, `${instructorId}@test.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(
      instructorId,
      'role_admin'
    );

    const rewardId = createActiveReward(sponsorId, cohortId, { rewardType: 'grade' });

    produceOutboxEvent('grade_approved', `sub-${uuidv4()}`, studentId, {
      reviewerId: instructorId,
    });
    processPendingEvents();

    const allocations = getRewardAllocations(rewardId);
    const studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc).toBeDefined();
    expect(studentAlloc!.status).toBe('eligible');
  });
});
