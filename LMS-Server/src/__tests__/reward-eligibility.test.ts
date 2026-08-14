import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
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
