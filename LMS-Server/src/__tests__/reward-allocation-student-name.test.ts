/**
 * UX-001 Rev 2 — reward allocation responses carry the learner's name, so the
 * Release and Refund confirmations can say who is paid.
 */
import { describe, it, expect } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { createReward, fundReward, activateReward, getRewardAllocations } from '../services/rewards/rewardService.js';

function makeUser(name: string, role: string): string {
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(id, name, `${id}@test.com`, 'hash', role);
  return id;
}

describe('getRewardAllocations student_name (UX-001)', () => {
  it('returns each learner\'s name next to their allocation', () => {
    const sponsorId = makeUser('Sponsor', 'admin');
    const adminId = makeUser('Admin', 'admin');
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare("INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)").run(courseId, `C-${courseId.slice(0, 8)}`);
    db.prepare("INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')").run(cohortId, sponsorId, courseId);
    const ada = makeUser('Ada Lovelace', 'student');
    const bob = makeUser('Bob Learner', 'student');
    for (const id of [ada, bob]) db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, id);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId, rewardType: 'course_completion',
      amountStroops: '100', maxRecipients: 2, idempotencyKey: uuidv4(),
    });
    fundReward(reward.id, adminId, { type: 'admin_grant' }, uuidv4());
    activateReward(reward.id, sponsorId, uuidv4());

    const names = Object.fromEntries(getRewardAllocations(reward.id).map(a => [a.student_user_id, a.student_name]));
    expect(names).toEqual({ [ada]: 'Ada Lovelace', [bob]: 'Bob Learner' });
  });
});
