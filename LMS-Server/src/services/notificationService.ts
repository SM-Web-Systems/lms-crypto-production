/**
 * notificationService.ts — Phase 7 C2: create persistent notification rows.
 *
 * Synchronous (better-sqlite3). Callers wrap in try/catch — emission is best-effort.
 */

import { execute } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}): void {
  execute(
    `INSERT INTO notifications (id, user_id, type, title, body, link)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), params.userId, params.type, params.title, params.body, params.link ?? null]
  );
}
