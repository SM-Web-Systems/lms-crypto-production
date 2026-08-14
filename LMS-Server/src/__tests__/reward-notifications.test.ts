/**
 * reward-notifications.test.ts — N7-N8: Reward notification tests
 *
 * Tests notification delivery, opt-out, failure isolation, privacy.
 */
import { describe, it, expect } from 'vitest';
import { db } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import {
  notifyRewardReleased,
  notifyRewardEligible,
  notifyRewardRefunded,
  notifyRewardExpired,
  notifyRewardCancelled,
  notifyRefundBlocked,
} from '../services/rewards/rewardNotificationService.js';
import { CONFIGURABLE_TYPES, updatePreferences } from '../services/notificationService.js';

function createUser(role = 'student'): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, 'hash', ?)"
  ).run(id, `${id}@test.com`, role);
  return id;
}

function getNotifications(userId: string, type?: string): Array<Record<string, unknown>> {
  let sql = 'SELECT * FROM notifications WHERE user_id = ?';
  const params: unknown[] = [userId];
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  return db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
}

describe('Reward Notifications — N7-N8', () => {
  it('NOTIF-TYPE: all 6 reward notification types are in CONFIGURABLE_TYPES', () => {
    const types = CONFIGURABLE_TYPES as readonly string[];
    expect(types).toContain('reward_released');
    expect(types).toContain('reward_eligible');
    expect(types).toContain('reward_refunded');
    expect(types).toContain('reward_expired');
    expect(types).toContain('reward_cancelled');
    expect(types).toContain('refund_blocked');
  });

  it('NOTIF-1: reward_released delivered to student', () => {
    const studentId = createUser('student');
    notifyRewardReleased(studentId, 'Test Reward', '1.0000000');

    const notifs = getNotifications(studentId, 'reward_released');
    expect(notifs.length).toBe(1);
    expect(notifs[0].title).toBe('Reward Released');
    expect((notifs[0].body as string)).toContain('1.0000000 XLM');
  });

  it('NOTIF-2: reward_eligible delivered to student + creator', () => {
    const studentId = createUser('student');
    const creatorId = createUser('admin');
    notifyRewardEligible(studentId, creatorId, 'Test Reward', true);

    expect(getNotifications(studentId, 'reward_eligible').length).toBe(1);
    expect(getNotifications(creatorId, 'reward_eligible').length).toBe(1);
  });

  it('NOTIF-2b: reward_eligible only to student if auto-release', () => {
    const studentId = createUser('student');
    const creatorId = createUser('admin');
    notifyRewardEligible(studentId, creatorId, 'Test Reward', false);

    expect(getNotifications(studentId, 'reward_eligible').length).toBe(1);
    expect(getNotifications(creatorId, 'reward_eligible').length).toBe(0);
  });

  it('NOTIF-3: reward_refunded delivered to both parties', () => {
    const recipientId = createUser('student');
    const creatorId = createUser('admin');
    notifyRewardRefunded(recipientId, creatorId, '2.0000000', 'Test Reward');

    expect(getNotifications(recipientId, 'reward_refunded').length).toBe(1);
    expect(getNotifications(creatorId, 'reward_refunded').length).toBe(1);
  });

  it('NOTIF-4: reward_expired delivered to creator only', () => {
    const creatorId = createUser('admin');
    notifyRewardExpired(creatorId, 'Test Reward');

    expect(getNotifications(creatorId, 'reward_expired').length).toBe(1);
  });

  it('NOTIF-5: reward_cancelled delivered to creator + recipients', () => {
    const creatorId = createUser('admin');
    const student1 = createUser('student');
    const student2 = createUser('student');
    notifyRewardCancelled(creatorId, 'Test Reward', [student1, student2]);

    expect(getNotifications(creatorId, 'reward_cancelled').length).toBe(1);
    expect(getNotifications(student1, 'reward_cancelled').length).toBe(1);
    expect(getNotifications(student2, 'reward_cancelled').length).toBe(1);
  });

  it('NOTIF-6: refund_blocked delivered to admin reviewers', () => {
    const adminId = createUser('admin');
    // Assign admin role with refund_review permission
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(adminId, 'role_admin');

    notifyRefundBlocked('attempt-123', '1.5000000');

    const notifs = getNotifications(adminId, 'refund_blocked');
    expect(notifs.length).toBe(1);
    expect((notifs[0].body as string)).toContain('attempt-123');
    expect((notifs[0].body as string)).toContain('1.5000000');
    // Should NOT contain student balance data
    expect((notifs[0].body as string)).not.toContain('balance');
  });

  it('NOTIF-7: opted-out user does not receive notification', () => {
    const studentId = createUser('student');

    // Opt out of reward_released
    updatePreferences(studentId, [{ type: 'reward_released', enabled: false }]);

    notifyRewardReleased(studentId, 'Test', '1.0');

    expect(getNotifications(studentId, 'reward_released').length).toBe(0);
  });

  it('NOTIF-8: notification failure does not throw', () => {
    // Pass an invalid user ID — should not throw
    expect(() => {
      notifyRewardReleased('nonexistent-user-id', 'Test', '1.0');
    }).not.toThrow();
  });

  it('NOTIF-10: no balance data in notification body', () => {
    const studentId = createUser('student');
    const creatorId = createUser('admin');

    notifyRewardReleased(studentId, 'Test', '1.0000000');
    notifyRewardRefunded(studentId, creatorId, '1.0000000', 'Test');

    const allNotifs = getNotifications(studentId);
    for (const notif of allNotifs) {
      const body = notif.body as string;
      expect(body).not.toMatch(/available_stroops|reserved_stroops|recipient_available/i);
    }
  });
});
