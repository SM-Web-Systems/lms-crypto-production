import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';
import { assignUserRole } from './roleSecurityService.js';
import { createNotification } from './notificationService.js';
import { sendRoleRequestDecisionEmail } from './emailService.js';
import logger from '../utils/logger.js';

/**
 * A signed-in user asks for a parent, teacher, employer or sponsor role and says why. A super student can also
 * ask to be a teaching assistant; an instructor or admin then adds them to the courses they help with. An administrator who can
 * assign roles approves or declines it. Approval goes through assignUserRole, so the usual hierarchy rules apply.
 * Super student is never requested: it is earned automatically by completing courses.
 */
export const REQUESTABLE_ROLES: Record<string, string> = {
  role_parent: 'Parent', role_teacher: 'Teacher', role_employer: 'Employer', role_sponsor: 'Sponsor',
  role_ta: 'Teaching Assistant',
};
/** Roles only some users may ask for: a teaching assistant must already be a super student. */
const REQUIRES: Record<string, { roleId: string; message: string }> = {
  role_ta: { roleId: 'role_supporter_student', message: 'Only super students can ask to become a teaching assistant.' },
};

/** The roles this user may ask for now: never one they already hold or are already waiting on. */
export function requestableRolesFor(userId: string): Array<{ id: string; label: string }> {
  const has = (roleId: string) => !!db.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?').get(userId, roleId);
  const waiting = (roleId: string) => !!db.prepare("SELECT 1 FROM role_requests WHERE user_id = ? AND role_id = ? AND status = 'pending'").get(userId, roleId);
  return Object.entries(REQUESTABLE_ROLES)
    .filter(([id]) => !REQUIRES[id] || has(REQUIRES[id].roleId))
    .filter(([id]) => !has(id) && !waiting(id))
    .map(([id, label]) => ({ id, label }));
}

export interface RoleRequestRow {
  id: string; userId: string; userName: string; userEmail: string; roleId: string; roleLabel: string;
  reason: string; status: string; reviewNote: string | null; createdAt: string; reviewedAt: string | null;
}

const SELECT = `SELECT r.id, r.user_id AS userId, u.name AS userName, u.email AS userEmail, r.role_id AS roleId,
  ro.label AS roleLabel, r.reason, r.status, r.review_note AS reviewNote, r.created_at AS createdAt, r.reviewed_at AS reviewedAt
  FROM role_requests r JOIN users u ON u.id = r.user_id JOIN roles ro ON ro.id = r.role_id`;

export function createRoleRequest(userId: string, roleId: unknown, reason: unknown): RoleRequestRow {
  if (typeof roleId !== 'string' || !REQUESTABLE_ROLES[roleId]) {
    throw new AppError('You can request the parent, teacher, employer, sponsor or teaching assistant role.', 400, ErrorCodes.VALIDATION_ERROR);
  }
  const needs = REQUIRES[roleId];
  if (needs && !db.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?').get(userId, needs.roleId)) {
    throw new AppError(needs.message, 403, ErrorCodes.FORBIDDEN);
  }
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 5 || text.length > 1000) {
    throw new AppError('Please say in a few words why you need this role (5 to 1000 characters).', 400, ErrorCodes.VALIDATION_ERROR);
  }
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?').get(userId, roleId)) {
      throw new AppError('You already have this role.', 409, ErrorCodes.DUPLICATE_ENTRY);
    }
    if (db.prepare("SELECT 1 FROM role_requests WHERE user_id = ? AND role_id = ? AND status = 'pending'").get(userId, roleId)) {
      throw new AppError('You already asked for this role. An administrator will answer soon.', 409, ErrorCodes.DUPLICATE_ENTRY);
    }
    const recent = db.prepare("SELECT COUNT(*) AS n FROM role_requests WHERE user_id = ? AND created_at > datetime('now', '-1 day')").get(userId) as { n: number };
    if (recent.n >= 5) throw new AppError('Too many requests today. Please try again tomorrow.', 429, ErrorCodes.RATE_LIMITED);
    const id = uuidv4();
    db.prepare("INSERT INTO role_requests (id, user_id, role_id, reason, status) VALUES (?, ?, ?, ?, 'pending')").run(id, userId, roleId, text);
    return db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as RoleRequestRow;
  }).immediate();
}

export function myRoleRequests(userId: string): RoleRequestRow[] {
  return db.prepare(`${SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 20`).all(userId) as RoleRequestRow[];
}

export function cancelRoleRequest(userId: string, id: string): boolean {
  return db.prepare("UPDATE role_requests SET status = 'cancelled', reviewed_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'pending'")
    .run(id, userId).changes > 0;
}

export function listRoleRequests(status: string): RoleRequestRow[] {
  const s = ['pending', 'approved', 'declined', 'cancelled'].includes(status) ? status : 'pending';
  return db.prepare(`${SELECT} WHERE r.status = ? ORDER BY r.created_at ${s === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`).all(s) as RoleRequestRow[];
}

function notify(row: RoleRequestRow, approved: boolean, note: string | null): void {
  const title = approved ? `You are now a ${row.roleLabel}` : `Your ${row.roleLabel} request was declined`;
  const body = approved
    ? `Your request for the ${row.roleLabel} role was approved. Sign in again to see your new dashboard.${note ? ` Note: ${note}` : ''}`
    : `Your request for the ${row.roleLabel} role was not approved.${note ? ` Reason: ${note}` : ''}`;
  try { createNotification({ userId: row.userId, type: 'system', title, body, link: '/profile', force: true }); }
  catch (err) { logger.error({ module: 'roleRequest', err }, 'Role request notification failed'); }
  void sendRoleRequestDecisionEmail({ to: row.userEmail, name: row.userName, roleLabel: row.roleLabel, approved, note }).catch(() => undefined);
}

/** Approve or decline a pending request. Approval assigns the role with the reviewer's own authority. */
export function decideRoleRequest(reviewerId: string, id: string, approve: boolean, note: unknown): RoleRequestRow {
  const text = typeof note === 'string' && note.trim() ? note.trim().slice(0, 1000) : null;
  const row = db.transaction(() => {
    const current = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as RoleRequestRow | undefined;
    if (!current) throw new AppError('Request not found', 404, ErrorCodes.NOT_FOUND);
    if (current.status !== 'pending') throw new AppError(`This request is already ${current.status}.`, 409, 'INVALID_STATUS');
    if (approve) assignUserRole(reviewerId, current.userId, current.roleId);
    db.prepare("UPDATE role_requests SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = datetime('now') WHERE id = ?")
      .run(approve ? 'approved' : 'declined', reviewerId, text, id);
    return { ...current, status: approve ? 'approved' : 'declined', reviewNote: text };
  }).immediate();
  notify(row, approve, text);
  return row;
}
