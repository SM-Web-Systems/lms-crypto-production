import { execute } from '../config/database.js';

export function auditLog(opts: {
  action: string;
  actorId: string;
  targetId?: string;
  details?: string;
}): void {
  try {
    execute(
      `INSERT INTO audit_log (action, actor_id, target_id, details, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [opts.action, opts.actorId, opts.targetId ?? null, opts.details ?? null],
    );
  } catch {
    // Non-fatal: audit table may not exist in older databases or tests
    console.warn(`[audit] Failed to log: ${opts.action}`);
  }
}
