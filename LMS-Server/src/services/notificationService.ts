/**
 * notificationService.ts — Phase 23 C3: notification creation with preference check,
 * broadcast support, and preference CRUD.
 *
 * Synchronous (better-sqlite3). Callers wrap in try/catch — emission is best-effort.
 */

import { execute, query, queryOne } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export const CONFIGURABLE_TYPES = [
  'submission_reviewed', 'nft_approved', 'nft_rejected', 'nft_minted',
  'course_enrolled', 'new_enrollment', 'payment_confirmed', 'payment_failed',
  'cohort_invited',
  // Phase F6: role-specific notification types
  'student_login', 'class_completion', 'cohort_milestone', 'team_completion', 'grade_approved',
] as const;

export function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  force?: boolean;
}): void {
  if (!params.force) {
    const pref = queryOne<{ enabled: number }>(
      'SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?',
      [params.userId, params.type]
    );
    if (pref && pref.enabled === 0) return;
  }
  execute(
    `INSERT INTO notifications (id, user_id, type, title, body, link)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), params.userId, params.type, params.title, params.body, params.link ?? null]
  );
}

export function createBroadcast(params: {
  title: string;
  body: string;
  target: 'all' | 'student' | 'lecturer' | 'sponsor';
  link?: string;
}): number {
  let users: { id: string }[];
  if (params.target === 'all') {
    users = query<{ id: string }>('SELECT id FROM users');
  } else {
    users = query<{ id: string }>('SELECT id FROM users WHERE role = ?', [params.target]);
  }
  for (const user of users) {
    createNotification({
      userId: user.id,
      type: 'admin_broadcast',
      title: params.title,
      body: params.body,
      link: params.link,
      force: true,
    });
  }
  return users.length;
}

export function getPreferences(userId: string): { type: string; enabled: boolean }[] {
  const rows = query<{ type: string; enabled: number }>(
    'SELECT type, enabled FROM notification_preferences WHERE user_id = ?',
    [userId]
  );
  const overrides = new Map(rows.map(r => [r.type, r.enabled === 1]));
  return CONFIGURABLE_TYPES.map(type => ({
    type,
    enabled: overrides.get(type) ?? true,
  }));
}

export function updatePreferences(userId: string, prefs: { type: string; enabled: boolean }[]): void {
  for (const { type, enabled } of prefs) {
    if (!(CONFIGURABLE_TYPES as readonly string[]).includes(type)) continue;
    execute(
      `INSERT INTO notification_preferences (id, user_id, type, enabled, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, type) DO UPDATE SET enabled = ?, updated_at = datetime('now')`,
      [uuidv4(), userId, type, enabled ? 1 : 0, enabled ? 1 : 0]
    );
  }
}
