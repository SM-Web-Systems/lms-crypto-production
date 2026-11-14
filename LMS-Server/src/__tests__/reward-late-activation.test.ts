/**
 * A reward that becomes active after a learner already earned a reward from the same quiz must still
 * fire on the learner's next genuine pass. The outbox event is one row per learner and quiz, and used
 * to be left alone once ANY reward had paid from it, so later rewards never fired.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { createReward, activateReward, fundReward, getRewardAllocations } from '../services/rewards/rewardService.js';
import { produceOutboxEvent, processPendingEvents } from '../services/rewards/rewardEligibilityService.js';

function clean(): void {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DELETE FROM reward_eligibility_events; DELETE FROM reward_event_outbox; DELETE FROM reward_allocations;
    DELETE FROM reward_transactions; DELETE FROM reward_accounts; DELETE FROM rewards;
    DELETE FROM user_group_members; DELETE FROM user_groups;
    DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users); DELETE FROM users;
  `);
  db.pragma('foreign_keys = ON');
}
afterEach(clean);

const user = (role: string) => {
  const id = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', ?, 'h', ?)").run(id, `${id}@t.com`, role);
  return id;
};

function activeReward(teacherId: string, groupId: string, description: string): string {
  const reward = createReward(teacherId, {
    scopeType: 'teacher_class', scopeId: groupId, rewardType: 'custom', amountStroops: '1000000',
    autoRelease: false, description, idempotencyKey: `idem-${uuidv4()}`,
  });
  const funder = user('admin');
  db.prepare("INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'funder', 20000000, 0, 'XLM')")
    .run(uuidv4(), funder);
  fundReward(reward.id, funder, { type: 'admin_grant' }, `fund-${uuidv4()}`);
  activateReward(reward.id, teacherId, `act-${uuidv4()}`);
  return reward.id;
}

function classWith(learnerId: string) {
  const teacherId = user('student');
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'role_teacher')").run(teacherId);
  const groupId = uuidv4();
  db.prepare("INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Class', 'class', ?)").run(groupId, teacherId);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(groupId, learnerId);
  return { teacherId, groupId };
}

const statusOf = (rewardId: string, learnerId: string) =>
  getRewardAllocations(rewardId).find((a) => a.student_user_id === learnerId)?.status;

describe('rewards activated after an earlier pass', () => {
  it('fires on the next genuine pass, and does not pay the first reward twice', () => {
    const learner = user('student');
    const { teacherId, groupId } = classWith(learner);

    const first = activeReward(teacherId, groupId, 'first');
    produceOutboxEvent('quiz_pass', 'q-1', learner);
    processPendingEvents();
    expect(statusOf(first, learner)).toBe('eligible');

    const second = activeReward(teacherId, groupId, 'second');
    produceOutboxEvent('quiz_pass', 'q-1', learner); // the learner passes again
    processPendingEvents();

    expect(statusOf(second, learner)).toBe('eligible');
    expect(statusOf(first, learner)).toBe('eligible');
    const records = db.prepare("SELECT reward_id FROM reward_eligibility_events WHERE student_user_id = ? AND result = 'eligible'").all(learner);
    expect(records).toHaveLength(2);
  });

  it('does nothing when every active reward already fired for that pass', () => {
    const learner = user('student');
    const { teacherId, groupId } = classWith(learner);
    activeReward(teacherId, groupId, 'only');
    produceOutboxEvent('quiz_pass', 'q-2', learner);
    processPendingEvents();
    produceOutboxEvent('quiz_pass', 'q-2', learner);
    const row = db.prepare("SELECT status FROM reward_event_outbox WHERE event_source_id = 'q-2'").get() as { status: string };
    expect(row.status).toBe('completed');
  });
});
