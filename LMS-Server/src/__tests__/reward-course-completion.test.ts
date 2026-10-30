/**
 * reward-course-completion.test.ts — W04 behavioral tests
 *
 * Tests genuine course completion gating and course-bound reward eligibility.
 * All scenarios use synthetic in-memory DB; no mocked progress percentages.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { isCourseCompleteForReward, getCourseProgress } from '../services/courseCompletionService.js';
import {
  createReward,
  activateReward,
  fundReward,
  getRewardAllocations,
} from '../services/rewards/rewardService.js';
import {
  produceOutboxEvent,
  processPendingEvents,
  evaluateEligibility,
} from '../services/rewards/rewardEligibilityService.js';

// ──── Helpers ────────────────────────────────────────────────────────────────

function cleanW04Tables(): void {
  // Temporarily disable FK checks during test teardown to avoid ordering issues.
  // All seeded data is synthetic; referential integrity is ensured by test setup.
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DELETE FROM reward_eligibility_events;
    DELETE FROM reward_event_outbox;
    DELETE FROM reward_allocations;
    DELETE FROM reward_transactions;
    DELETE FROM reward_accounts;
    DELETE FROM rewards;
    DELETE FROM reward_refund_attempts;
    DELETE FROM lesson_completions;
    DELETE FROM quiz_completions;
    DELETE FROM submissions;
    DELETE FROM students;
    DELETE FROM cohort_members;
    DELETE FROM sponsor_cohorts;
    DELETE FROM user_group_members;
    DELETE FROM user_groups;
    DELETE FROM user_links;
    DELETE FROM course_completion_requirements;
    DELETE FROM quizzes;
    DELETE FROM user_course_codes;
    DELETE FROM courses;
    DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users);
    DELETE FROM users;
  `);
  db.pragma('foreign_keys = ON');
}

afterEach(cleanW04Tables);

function makeItem(id: string, type = 'lesson'): Record<string, unknown> {
  return { id, type, title: `Item ${id}` };
}

function courseSections(items: Record<string, unknown>[]): string {
  return JSON.stringify([{ id: 's1', title: 'Section 1', items }]);
}

function seedUser(role = 'student'): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', ?, 'h', ?)"
  ).run(id, `${id}@t.com`, role);
  return id;
}

function seedCourse(
  items: string[],
  opts?: { itemType?: string; empty?: boolean }
): string {
  const courseId = uuidv4();
  const courseCode = `CC-${courseId.slice(0, 6)}`;
  const sections = opts?.empty
    ? '[]'
    : courseSections(items.map((id) => makeItem(id, opts?.itemType ?? 'lesson')));
  db.prepare(
    "INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'C', 'd', ?, ?)"
  ).run(courseId, courseCode, sections);
  return courseId;
}

/** Enroll a student in a course via user_course_codes (for HTTP route access). */
function enrollStudent(userId: string, courseId: string): void {
  const row = db.prepare('SELECT course_code FROM courses WHERE id = ?').get(courseId) as { course_code: string } | undefined;
  if (row) {
    db.prepare('INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)').run(userId, row.course_code);
  }
}

function completeLesson(userId: string, courseId: string, itemId: string): void {
  db.prepare(
    `INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct)
     VALUES (?, ?, ?, ?, 's1', ?, 100)
     ON CONFLICT (user_id, course_id, item_id)
     DO UPDATE SET completed_at = datetime('now'), progress_pct = 100 WHERE completed_at IS NULL`
  ).run(uuidv4(), userId, courseId, itemId, userId);
}

function seedSponsorCohort(courseId: string): { sponsorId: string; studentId: string; cohortId: string } {
  const sponsorId = seedUser('admin');
  const studentId = seedUser('student');
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'role_sponsor')").run(sponsorId);
  const cohortId = uuidv4();
  db.prepare(
    "INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')"
  ).run(cohortId, sponsorId, courseId);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  return { sponsorId, studentId, cohortId };
}

function seedTeacherClass(courseId: string): { teacherId: string; studentId: string; groupId: string } {
  const teacherId = seedUser('lecturer');
  const studentId = seedUser('student');
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'role_instructor')").run(teacherId);
  const groupId = uuidv4();
  db.prepare(
    "INSERT INTO user_groups (id, owner_user_id, name, group_type) VALUES (?, ?, 'Class', 'class')"
  ).run(groupId, teacherId);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(groupId, studentId);
  return { teacherId, studentId, groupId };
}

function seedIndependentAdmin(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'h', 'admin')"
  ).run(id, `${id}@t.com`);
  return id;
}

function createFundedActiveReward(
  actorId: string,
  scopeType: 'sponsor_cohort' | 'teacher_class',
  scopeId: string,
  eligibilityConfig?: string
): string {
  const reward = createReward(actorId, {
    scopeType,
    scopeId,
    rewardType: 'course_completion',
    amountStroops: '5000000',
    autoRelease: false,
    eligibilityConfig,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  const funderId = seedIndependentAdmin();
  const fundKey = `fund-${uuidv4()}`;
  // Seed platform credit for funder
  db.prepare(
    "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')"
  ).run(uuidv4(), funderId);
  fundReward(reward.id, funderId, { type: 'admin_grant' }, fundKey);
  activateReward(reward.id, actorId, `act-${uuidv4()}`);
  return reward.id;
}

function createToken(userId: string): string {
  return generateToken({ userId, email: `${userId}@t.com`, role: 'student' });
}

// ──── §1: isCourseCompleteForReward predicate ─────────────────────────────────

describe('isCourseCompleteForReward predicate', () => {
  it('W04-L-1: predicate false when not all lessons complete', () => {
    const userId = seedUser();
    const [i1, i2, i3] = [uuidv4(), uuidv4(), uuidv4()];
    const courseId = seedCourse([i1, i2, i3]);
    completeLesson(userId, courseId, i1);
    expect(isCourseCompleteForReward(userId, courseId)).toBe(false);
  });

  it('W04-L-2: predicate true when all lessons complete', () => {
    const userId = seedUser();
    const [i1, i2, i3] = [uuidv4(), uuidv4(), uuidv4()];
    const courseId = seedCourse([i1, i2, i3]);
    completeLesson(userId, courseId, i1);
    completeLesson(userId, courseId, i2);
    completeLesson(userId, courseId, i3);
    expect(isCourseCompleteForReward(userId, courseId)).toBe(true);
  });

  it('W04-L-3: predicate false for empty course (fail-closed)', () => {
    const userId = seedUser();
    const courseId = seedCourse([], { empty: true });
    expect(isCourseCompleteForReward(userId, courseId)).toBe(false);
  });

  it('W04-L-4: predicate false when course does not exist', () => {
    const userId = seedUser();
    expect(isCourseCompleteForReward(userId, 'nonexistent-course-id')).toBe(false);
  });

  it('W04-Q-1: predicate true when required quiz is the final requirement', () => {
    const userId = seedUser();
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    completeLesson(userId, courseId, i1);

    const quizId = uuidv4();
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Quiz', '[]', 70, ?)"
    ).run(quizId, courseId);
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 0)'
    ).run(uuidv4(), courseId, JSON.stringify([quizId]));
    // Quiz not passed yet → false
    expect(isCourseCompleteForReward(userId, courseId)).toBe(false);

    // Pass the quiz
    db.prepare(
      "INSERT INTO quiz_completions (id, quiz_id, user_id, score, total, passed, answers, payment_status, completed_at) VALUES (?, ?, ?, 85, 100, 1, '{}', 'none', datetime('now'))"
    ).run(uuidv4(), quizId, userId);
    expect(isCourseCompleteForReward(userId, courseId)).toBe(true);
  });

  it('W04-Q-2: predicate false when lessons done but required quiz not passed', () => {
    const userId = seedUser();
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    completeLesson(userId, courseId, i1);
    const quizId = uuidv4();
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Quiz', '[]', 70, ?)"
    ).run(quizId, courseId);
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 0)'
    ).run(uuidv4(), courseId, JSON.stringify([quizId]));
    // Quiz failed (score below min)
    db.prepare(
      "INSERT INTO quiz_completions (id, quiz_id, user_id, score, total, passed, answers, payment_status, completed_at) VALUES (?, ?, ?, 50, 100, 0, '{}', 'none', datetime('now'))"
    ).run(uuidv4(), quizId, userId);
    expect(isCourseCompleteForReward(userId, courseId)).toBe(false);
  });

  it('W04-Q-3: cross-course quiz does not satisfy gate', () => {
    const userId = seedUser();
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const otherCourseId = seedCourse([uuidv4()]);
    completeLesson(userId, courseId, i1);

    const quizId = uuidv4();
    // Quiz belongs to OTHER course
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Quiz', '[]', 70, ?)"
    ).run(quizId, otherCourseId);
    // Require this quiz for courseId
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 0)'
    ).run(uuidv4(), courseId, JSON.stringify([quizId]));
    // Student passed quiz (for the other course)
    db.prepare(
      "INSERT INTO quiz_completions (id, quiz_id, user_id, score, total, passed, answers, payment_status, completed_at) VALUES (?, ?, ?, 90, 100, 1, '{}', 'none', datetime('now'))"
    ).run(uuidv4(), quizId, userId);

    // Cross-course quiz: predicate must be false
    expect(isCourseCompleteForReward(userId, courseId)).toBe(false);
  });

  it('W04-S-1: submission approval satisfies gate when course-scoped', () => {
    const userId = seedUser();
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    completeLesson(userId, courseId, i1);

    // Create student record
    const studentId = uuidv4();
    db.prepare(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'S', ?, 'ENR001', 'CS', 1)"
    ).run(studentId, userId, `${userId}@t.com`);
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 1)'
    ).run(uuidv4(), courseId, '[]');

    // No approved submission yet → false
    expect(isCourseCompleteForReward(userId, courseId)).toBe(false);

    // Insert approved submission for this course
    db.prepare(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id) VALUES (?, ?, 'Work', 'desc', 'f.pdf', 1024, '/tmp/f.pdf', 'approved', ?)"
    ).run(uuidv4(), studentId, courseId);
    expect(isCourseCompleteForReward(userId, courseId)).toBe(true);
  });

  it('W04-S-2: submission from different course does not satisfy gate', () => {
    const userId = seedUser();
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const otherCourseId = seedCourse([uuidv4()]);
    completeLesson(userId, courseId, i1);

    const studentId = uuidv4();
    db.prepare(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'S', ?, 'ENR001', 'CS', 1)"
    ).run(studentId, userId, `${userId}@t.com`);
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 1)'
    ).run(uuidv4(), courseId, '[]');

    // Approved submission for OTHER course
    db.prepare(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id) VALUES (?, ?, 'Work', 'desc', 'f.pdf', 1024, '/tmp/f.pdf', 'approved', ?)"
    ).run(uuidv4(), studentId, otherCourseId);

    // Cross-course submission: predicate must be false
    expect(isCourseCompleteForReward(userId, courseId)).toBe(false);
  });
});

// ──── §2: getCourseProgress cross-course fixes ────────────────────────────────

describe('getCourseProgress cross-course fixes (W04)', () => {
  it('W04-CCP-1: submission from different course does not satisfy require_submissions', () => {
    const getCP = getCourseProgress;

    const userId = seedUser();
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const otherCourseId = seedCourse([uuidv4()]);
    completeLesson(userId, courseId, i1);

    const studentId = uuidv4();
    db.prepare(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'S', ?, 'ENR001', 'CS', 1)"
    ).run(studentId, userId, `${userId}@t.com`);
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 1)'
    ).run(uuidv4(), courseId, '[]');

    // Approved submission for other course
    db.prepare(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id) VALUES (?, ?, 'W', 'd', 'f.pdf', 1024, '/tmp/f.pdf', 'approved', ?)"
    ).run(uuidv4(), studentId, otherCourseId);

    const progress = getCP(userId, courseId);
    expect(progress.hasApprovedSubmission).toBe(false);
    expect(progress.meetsAllRequirements).toBe(false);
  });

  it('W04-CCP-2: required quiz from different course does not satisfy quiz gate', () => {
    const getCP = getCourseProgress;

    const userId = seedUser();
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const otherCourseId = seedCourse([uuidv4()]);
    completeLesson(userId, courseId, i1);

    const quizId = uuidv4();
    // Quiz belongs to other course
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Q', '[]', 70, ?)"
    ).run(quizId, otherCourseId);
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 0)'
    ).run(uuidv4(), courseId, JSON.stringify([quizId]));
    // Student passed the quiz (in the other course)
    db.prepare(
      "INSERT INTO quiz_completions (id, quiz_id, user_id, score, total, passed, answers, payment_status, completed_at) VALUES (?, ?, ?, 90, 100, 1, '{}', 'none', datetime('now'))"
    ).run(uuidv4(), quizId, userId);

    const progress = getCP(userId, courseId);
    expect(progress.allRequiredQuizzesPassed).toBe(false);
    expect(progress.meetsAllRequirements).toBe(false);
  });

  it('W04-CCP-3: same-course submission satisfies require_submissions after fix', () => {
    const getCP = getCourseProgress;

    const userId = seedUser();
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    completeLesson(userId, courseId, i1);

    const studentId = uuidv4();
    db.prepare(
      "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'S', ?, 'ENR001', 'CS', 1)"
    ).run(studentId, userId, `${userId}@t.com`);
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 1)'
    ).run(uuidv4(), courseId, '[]');
    db.prepare(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id) VALUES (?, ?, 'W', 'd', 'f.pdf', 1024, '/tmp/f.pdf', 'approved', ?)"
    ).run(uuidv4(), studentId, courseId);

    const progress = getCP(userId, courseId);
    expect(progress.hasApprovedSubmission).toBe(true);
    expect(progress.meetsAllRequirements).toBe(true);
  });
});

// ──── §3: Activation-time course binding validation ───────────────────────────

describe('course_completion reward activation binding (W04)', () => {
  it('W04-B-3: teacher_class reward without requiredCourseId refuses activation', () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const { teacherId, groupId } = seedTeacherClass(courseId);

    const reward = createReward(teacherId, {
      scopeType: 'teacher_class',
      scopeId: groupId,
      rewardType: 'course_completion',
      amountStroops: '5000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });
    const funderId = seedIndependentAdmin();
    db.prepare(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')"
    ).run(uuidv4(), funderId);
    fundReward(reward.id, funderId, { type: 'admin_grant' }, `fund-${uuidv4()}`);

    expect(() => activateReward(reward.id, teacherId, `act-${uuidv4()}`)).toThrow('MISSING_COURSE_BINDING');
  });

  it('W04-B-4: sponsor_cohort reward with conflicting requiredCourseId refuses activation', () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const otherCourseId = seedCourse([uuidv4()]);
    const { sponsorId, cohortId } = seedSponsorCohort(courseId);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '5000000',
      eligibilityConfig: JSON.stringify({ requiredCourseId: otherCourseId }), // CONFLICT
      idempotencyKey: `idem-${uuidv4()}`,
    });
    const funderId = seedIndependentAdmin();
    db.prepare(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')"
    ).run(uuidv4(), funderId);
    fundReward(reward.id, funderId, { type: 'admin_grant' }, `fund-${uuidv4()}`);

    expect(() => activateReward(reward.id, sponsorId, `act-${uuidv4()}`)).toThrow('CONFLICTING_COURSE_BINDING');
  });

  it('W04-B-5: sponsor_cohort reward without explicit config activates using cohort.course_id', () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const { sponsorId, cohortId } = seedSponsorCohort(courseId);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '5000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });
    const funderId = seedIndependentAdmin();
    db.prepare(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')"
    ).run(uuidv4(), funderId);
    fundReward(reward.id, funderId, { type: 'admin_grant' }, `fund-${uuidv4()}`);

    expect(() => activateReward(reward.id, sponsorId, `act-${uuidv4()}`)).not.toThrow();
  });

  it('W04-B-6: teacher_class reward with valid requiredCourseId activates successfully', () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const { teacherId, groupId } = seedTeacherClass(courseId);

    const reward = createReward(teacherId, {
      scopeType: 'teacher_class',
      scopeId: groupId,
      rewardType: 'course_completion',
      amountStroops: '5000000',
      eligibilityConfig: JSON.stringify({ requiredCourseId: courseId }),
      idempotencyKey: `idem-${uuidv4()}`,
    });
    const funderId = seedIndependentAdmin();
    db.prepare(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')"
    ).run(uuidv4(), funderId);
    fundReward(reward.id, funderId, { type: 'admin_grant' }, `fund-${uuidv4()}`);

    expect(() => activateReward(reward.id, teacherId, `act-${uuidv4()}`)).not.toThrow();
  });

  it('W04-B-7: activation fails when bound course is deleted', () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const { sponsorId, cohortId } = seedSponsorCohort(courseId);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '5000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });
    const funderId = seedIndependentAdmin();
    db.prepare(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')"
    ).run(uuidv4(), funderId);
    fundReward(reward.id, funderId, { type: 'admin_grant' }, `fund-${uuidv4()}`);

    // Delete the course (should cascade or set null — check schema)
    // course_id is NOT NULL in sponsor_cohorts; we simulate missing course
    db.prepare('DELETE FROM lesson_completions WHERE course_id = ?').run(courseId);
    db.prepare('DELETE FROM sponsor_cohorts WHERE id = ?').run(cohortId);
    db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);

    expect(() => activateReward(reward.id, sponsorId, `act-${uuidv4()}`)).toThrow('COURSE_NOT_FOUND');
  });
});

// ──── §4: Consumer — course binding + DB proof in evaluateEligibility ─────────

describe('evaluateEligibility course_completion consumer (W04)', () => {
  it('W04-D-4: forged event with courseId but no DB proof → ineligible', () => {
    const [i1, i2] = [uuidv4(), uuidv4()];
    const courseId = seedCourse([i1, i2]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    const rewardId = createFundedActiveReward(sponsorId, 'sponsor_cohort', cohortId);
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId) as import('../services/rewards/rewardTypes.js').RewardRow;

    // No lesson completions — forged event
    const fakeEvent = {
      id: uuidv4(),
      event_type: 'course_completion',
      event_source_id: courseId,
      student_user_id: studentId,
      event_data: JSON.stringify({ forged: true }),
      status: 'pending',
      attempt_count: 0,
    };

    const result = evaluateEligibility(fakeEvent, reward);
    expect(result).toBe('ineligible');
  });

  it('W04-D-5: legitimate DB proof → eligible', () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    const rewardId = createFundedActiveReward(sponsorId, 'sponsor_cohort', cohortId);
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId) as import('../services/rewards/rewardTypes.js').RewardRow;

    // All lessons done
    completeLesson(studentId, courseId, i1);

    const event = {
      id: uuidv4(),
      event_type: 'course_completion',
      event_source_id: courseId,
      student_user_id: studentId,
      event_data: null,
      status: 'pending',
      attempt_count: 0,
    };

    const result = evaluateEligibility(event, reward);
    expect(result).toBe('eligible');
  });

  it('W04-B-1: event for different course → ineligible', () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const otherCourseId = seedCourse([uuidv4()]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    const rewardId = createFundedActiveReward(sponsorId, 'sponsor_cohort', cohortId);
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId) as import('../services/rewards/rewardTypes.js').RewardRow;

    completeLesson(studentId, courseId, i1);

    // Event source is OTHER course
    const event = {
      id: uuidv4(),
      event_type: 'course_completion',
      event_source_id: otherCourseId, // WRONG course
      student_user_id: studentId,
      event_data: null,
      status: 'pending',
      attempt_count: 0,
    };

    const result = evaluateEligibility(event, reward);
    expect(result).toBe('ineligible');
  });

  it('W04-D-1: premature ineligible history + genuine completion → eligible on re-evaluation', () => {
    const [i1, i2] = [uuidv4(), uuidv4()];
    const courseId = seedCourse([i1, i2]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    const rewardId = createFundedActiveReward(sponsorId, 'sponsor_cohort', cohortId);

    // Simulate pre-existing premature outbox row (status=completed) + ineligible eligibility record
    const outboxId = uuidv4();
    db.prepare(
      `INSERT INTO reward_event_outbox (id, event_type, event_source_id, student_user_id, status, attempt_count, completed_at)
       VALUES (?, 'course_completion', ?, ?, 'completed', 1, datetime('now'))`
    ).run(outboxId, courseId, studentId);
    db.prepare(
      `INSERT INTO reward_eligibility_events (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key)
       VALUES (?, ?, 'course_completion', ?, ?, 'ineligible', ?)`
    ).run(uuidv4(), rewardId, courseId, studentId,
          `elig-${rewardId}-course_completion-${courseId}-${studentId}`);

    // Now student genuinely completes course
    completeLesson(studentId, courseId, i1);
    completeLesson(studentId, courseId, i2);

    // Producer emits (should reset outbox to pending)
    produceOutboxEvent('course_completion', courseId, studentId);

    // Outbox row should be reset to pending
    const outboxRow = db.prepare('SELECT status FROM reward_event_outbox WHERE event_type = ? AND event_source_id = ? AND student_user_id = ?').get('course_completion', courseId, studentId) as { status: string } | undefined;
    expect(outboxRow?.status).toBe('pending');

    // Process events
    processPendingEvents();

    // Allocation should now be eligible
    const allocations = getRewardAllocations(rewardId);
    const studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc?.status).toBe('eligible');
  });

  it('W04-D-2: outbox dedup reset when completed-ineligible', () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    // Create completed-ineligible outbox row (no eligible eligibility record)
    db.prepare(
      `INSERT INTO reward_event_outbox (id, event_type, event_source_id, student_user_id, status, attempt_count, completed_at)
       VALUES (?, 'course_completion', ?, ?, 'completed', 1, datetime('now'))`
    ).run(uuidv4(), courseId, studentId);

    // Produce event — should reset to pending
    produceOutboxEvent('course_completion', courseId, studentId);

    const row = db.prepare(
      "SELECT status FROM reward_event_outbox WHERE event_type = 'course_completion' AND event_source_id = ? AND student_user_id = ?"
    ).get(courseId, studentId) as { status: string } | undefined;
    expect(row?.status).toBe('pending');
  });

  it('W04-D-3: completing course A only qualifies A-bound reward, not B-bound reward', () => {
    const [iA1] = [uuidv4()];
    const [iB1] = [uuidv4()];
    const courseAId = seedCourse([iA1]);
    const courseBId = seedCourse([iB1]);

    const sponsorId = seedUser('admin');
    db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'role_sponsor')").run(sponsorId);
    const studentId = seedUser('student');

    const cohortA = uuidv4();
    const cohortB = uuidv4();
    db.prepare("INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'CohortA')").run(cohortA, sponsorId, courseAId);
    db.prepare("INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'CohortB')").run(cohortB, sponsorId, courseBId);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortA, studentId);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortB, studentId);

    const rewardAId = createFundedActiveReward(sponsorId, 'sponsor_cohort', cohortA);
    const rewardBId = createFundedActiveReward(sponsorId, 'sponsor_cohort', cohortB);

    // Complete only course A
    completeLesson(studentId, courseAId, iA1);
    produceOutboxEvent('course_completion', courseAId, studentId);
    processPendingEvents();

    const allocA = getRewardAllocations(rewardAId).find((a) => a.student_user_id === studentId);
    const allocB = getRewardAllocations(rewardBId).find((a) => a.student_user_id === studentId);
    expect(allocA?.status).toBe('eligible');
    expect(allocB?.status).toBe('pending'); // course B not completed
  });
});

// ──── §5: Producer guards via HTTP ────────────────────────────────────────────

describe('producer guards (HTTP)', () => {
  it('W04-P-1: lesson 1 of 2 — no course_completion outbox event emitted', async () => {
    const [i1, i2] = [uuidv4(), uuidv4()];
    const courseId = seedCourse([i1, i2]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    // Enroll student via user_course_codes for HTTP route access
    enrollStudent(studentId, courseId);

    const token = createToken(studentId);
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/${i1}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(res.status).toBe(200);
    const outboxRow = db.prepare(
      "SELECT * FROM reward_event_outbox WHERE event_type = 'course_completion' AND event_source_id = ? AND student_user_id = ?"
    ).get(courseId, studentId);
    // No event yet — only 1 of 2 lessons done
    expect(outboxRow).toBeNull();
  });

  it('W04-P-2: completing final lesson emits course_completion event', async () => {
    const [i1, i2] = [uuidv4(), uuidv4()];
    const courseId = seedCourse([i1, i2]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    enrollStudent(studentId, courseId);

    const token = createToken(studentId);

    // Complete lesson 1 (direct DB to avoid route dependency)
    completeLesson(studentId, courseId, i1);

    // Complete lesson 2 via HTTP — this is the final lesson
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/${i2}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(res.status).toBe(200);
    const outboxRow = db.prepare(
      "SELECT status FROM reward_event_outbox WHERE event_type = 'course_completion' AND event_source_id = ? AND student_user_id = ?"
    ).get(courseId, studentId) as { status: string } | undefined;
    expect(outboxRow).not.toBeNull();
    expect(outboxRow?.status).toBe('completed'); // processPendingEvents was called
  });
});

// ──── §6: End-to-end reward flow ──────────────────────────────────────────────

describe('end-to-end course_completion reward flow (W04)', () => {
  it('W04-E-1: sponsor cohort — complete all lessons → allocation eligible (auto_release=false)', async () => {
    const [i1, i2] = [uuidv4(), uuidv4()];
    const courseId = seedCourse([i1, i2]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);
    enrollStudent(studentId, courseId);

    // Create active funded reward
    const rewardId = createFundedActiveReward(sponsorId, 'sponsor_cohort', cohortId);

    const token = createToken(studentId);

    // Complete first lesson — no eligibility yet
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/${i1}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    let allocations = getRewardAllocations(rewardId);
    let studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc?.status).toBe('pending');

    // Complete second (final) lesson
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/${i2}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    allocations = getRewardAllocations(rewardId);
    studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc?.status).toBe('eligible');
    expect(studentAlloc?.eligible_at).not.toBeNull();
  });

  it('W04-E-2: quiz as final requirement — triggers completion after quiz pass', async () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const { teacherId, studentId, groupId } = seedTeacherClass(courseId);
    enrollStudent(studentId, courseId);

    const quizId = uuidv4();
    db.prepare(
      "INSERT INTO quizzes (id, title, questions, passing_score, course_id) VALUES (?, 'Q', '[{\"id\":\"q1\",\"text\":\"Q\",\"options\":[\"A\",\"B\"],\"correct\":0}]', 70, ?)"
    ).run(quizId, courseId);
    db.prepare(
      'INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions) VALUES (?, ?, 1, 0, ?, 70, 0)'
    ).run(uuidv4(), courseId, JSON.stringify([quizId]));

    const rewardId = createFundedActiveReward(teacherId, 'teacher_class', groupId,
      JSON.stringify({ requiredCourseId: courseId }));

    const token = createToken(studentId);

    // Complete the lesson
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/${i1}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    // No eligibility yet (quiz not passed)
    let allocations = getRewardAllocations(rewardId);
    let alloc = allocations.find((a) => a.student_user_id === studentId);
    expect(alloc?.status).toBe('pending');

    // Submit and pass quiz
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionId: 'q1', answer: '0' }] });

    allocations = getRewardAllocations(rewardId);
    alloc = allocations.find((a) => a.student_user_id === studentId);
    expect(alloc?.status).toBe('eligible');
  });

  it('W04-R-1: repeated final-lesson calls → one effective completion, one payout path', async () => {
    const [i1] = [uuidv4()];
    const courseId = seedCourse([i1]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);
    enrollStudent(studentId, courseId);

    const rewardId = createFundedActiveReward(sponsorId, 'sponsor_cohort', cohortId);
    const token = createToken(studentId);

    // Complete final lesson twice
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/${i1}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/${i1}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    // Only one eligibility event and one allocation eligible
    const eligRows = db.prepare('SELECT * FROM reward_eligibility_events WHERE student_user_id = ?').all(studentId) as Array<{ result: string }>;
    const eligibleCount = eligRows.filter((r) => r.result === 'eligible').length;
    expect(eligibleCount).toBe(1);

    const allocations = getRewardAllocations(rewardId);
    const studentAlloc = allocations.find((a) => a.student_user_id === studentId);
    expect(studentAlloc?.status).toBe('eligible');
  });
});

// ──── §7: W03 monetary preservation regressions ───────────────────────────────

describe('W03 monetary preservation (regression guard)', () => {
  it('W04-W-1: grade/quiz/custom reward behavior unchanged', () => {
    const courseId = seedCourse([uuidv4()]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'grade',
      amountStroops: '5000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });
    const funderId = seedIndependentAdmin();
    db.prepare(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')"
    ).run(uuidv4(), funderId);
    fundReward(reward.id, funderId, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsorId, `act-${uuidv4()}`);

    // A course_completion event should not trigger a 'grade' reward
    produceOutboxEvent('course_completion', courseId, studentId);
    processPendingEvents();

    const allocations = getRewardAllocations(reward.id);
    const alloc = allocations.find((a) => a.student_user_id === studentId);
    expect(alloc?.status).toBe('pending'); // grade reward not triggered by course_completion
  });

  it('W04-W-2: course_completion event does not trigger quiz_pass reward', () => {
    const courseId = seedCourse([uuidv4()]);
    const { sponsorId, studentId, cohortId } = seedSponsorCohort(courseId);

    // Create a 'milestone' reward which requires 'course_completion' event type check
    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'milestone',
      amountStroops: '3000000',
      eligibilityConfig: JSON.stringify({ requiredEventType: 'quiz_pass' }),
      idempotencyKey: `idem-${uuidv4()}`,
    });
    const funderId = seedIndependentAdmin();
    db.prepare(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')"
    ).run(uuidv4(), funderId);
    fundReward(reward.id, funderId, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsorId, `act-${uuidv4()}`);

    // course_completion event for this student
    produceOutboxEvent('course_completion', courseId, studentId);
    processPendingEvents();

    const allocations = getRewardAllocations(reward.id);
    const alloc = allocations.find((a) => a.student_user_id === studentId);
    expect(alloc?.status).toBe('pending'); // not triggered by course_completion
  });
});
