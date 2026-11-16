import { describe, it, expect } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { activateReward } from '../services/rewards/rewardService.js';

function user(roleId: string, legacy: 'student' | 'lecturer' | 'admin') {
  const id = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)").run(id, `U ${id.slice(0, 6)}`, `${id}@test.invalid`, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return id;
}

/** A funded reward for a class that has since changed hands: created by `creator`, the class is now owned by `owner`. */
function fundedRewardInMovedClass() {
  const creator = user('role_teacher', 'lecturer');
  const owner = user('role_teacher', 'lecturer');
  const student = user('role_student', 'student');
  const groupId = uuidv4();
  db.prepare("INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Moved class', 'class', ?)").run(groupId, owner);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(groupId, student);
  const rewardId = uuidv4();
  db.prepare(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, max_recipients, description, status, idempotency_key)
    VALUES (?, ?, 'teacher_class', ?, 'custom', 1000000, 1, 'Well Done', 'funded', ?)`).run(rewardId, creator, groupId, uuidv4());
  return { creator, owner, student, groupId, rewardId };
}

describe('activating a funded reward is judged on the person activating it', () => {
  it('lets the current class owner activate even though the creator no longer owns the class', () => {
    const f = fundedRewardInMovedClass();
    expect(activateReward(f.rewardId, f.owner, uuidv4()).status).toBe('active');
  });

  it('lets an administrator with reward.manage activate it', () => {
    const f = fundedRewardInMovedClass();
    const admin = user('role_admin', 'admin');
    expect(activateReward(f.rewardId, admin, uuidv4()).status).toBe('active');
  });

  it('still refuses a teacher who does not own the class, and the old creator who lost it', () => {
    const f = fundedRewardInMovedClass();
    const stranger = user('role_teacher', 'lecturer');
    expect(() => activateReward(f.rewardId, stranger, uuidv4())).toThrow(/access/);
    expect(() => activateReward(f.rewardId, f.creator, uuidv4())).toThrow(/access/);
    expect(db.prepare('SELECT status FROM rewards WHERE id = ?').get(f.rewardId)).toEqual({ status: 'funded' });
  });
});
