import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';

/**
 * A parent can link a learner who already has an account only by invitation. The parent sees the learner's
 * progress, sign-in history and wallets only after the learner accepts. Declining or ignoring changes nothing.
 * Creating a child account (POST /parent/children) still links at once, because the parent made that account.
 */

export interface PendingParentInvitation { id: string; parentName: string; createdAt: string }
export type ParentInviteResult = 'invited' | 'already_linked' | 'already_invited' | 'not_found';

const isLinked = (parentId: string, childId: string) =>
  !!db.prepare("SELECT 1 FROM user_links WHERE parent_user_id = ? AND child_user_id = ? AND link_type = 'parent'").get(parentId, childId);

/** Only active learners can be invited. The caller must not reveal which case happened. */
export function inviteChild(parentId: string, email: string): ParentInviteResult {
  return db.transaction((): ParentInviteResult => {
    const learner = db.prepare(`SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = 'role_student'
      WHERE lower(u.email) = lower(?) AND COALESCE(u.deletion_status, '') NOT IN ('pending_deletion', 'finalized') LIMIT 1`).get(email.trim()) as { id: string } | undefined;
    if (!learner || learner.id === parentId) return 'not_found';
    if (isLinked(parentId, learner.id)) return 'already_linked';
    if (db.prepare("SELECT 1 FROM parent_invitations WHERE parent_user_id = ? AND invited_user_id = ? AND status = 'pending'").get(parentId, learner.id)) return 'already_invited';
    db.prepare("INSERT INTO parent_invitations (id, parent_user_id, invited_user_id, status) VALUES (?, ?, ?, 'pending')")
      .run(uuidv4(), parentId, learner.id);
    return 'invited';
  }).immediate();
}

export function listParentInvitations(parentId: string) {
  return db.prepare(`SELECT i.id, i.status, i.created_at AS createdAt, i.responded_at AS respondedAt, u.name, u.email
    FROM parent_invitations i JOIN users u ON u.id = i.invited_user_id
    WHERE i.parent_user_id = ? ORDER BY i.created_at DESC LIMIT 200`).all(parentId);
}

export function cancelParentInvitation(parentId: string, invitationId: string): boolean {
  return db.prepare("UPDATE parent_invitations SET status = 'cancelled', responded_at = datetime('now') WHERE id = ? AND parent_user_id = ? AND status = 'pending'")
    .run(invitationId, parentId).changes > 0;
}

export function myPendingParentInvitations(userId: string): PendingParentInvitation[] {
  return db.prepare(`SELECT i.id, p.name AS parentName, i.created_at AS createdAt
    FROM parent_invitations i JOIN users p ON p.id = i.parent_user_id
    WHERE i.invited_user_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC LIMIT 50`).all(userId) as PendingParentInvitation[];
}

/** Accept or decline one of my own pending invitations. Returns false when it is not mine or not pending. */
export function respondToParentInvitation(userId: string, invitationId: string, accept: boolean): boolean {
  return db.transaction(() => {
    const invitation = db.prepare("SELECT parent_user_id FROM parent_invitations WHERE id = ? AND invited_user_id = ? AND status = 'pending'")
      .get(invitationId, userId) as { parent_user_id: string } | undefined;
    if (!invitation) return false;
    if (accept && !isLinked(invitation.parent_user_id, userId)) {
      db.prepare("INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')").run(uuidv4(), invitation.parent_user_id, userId);
    }
    db.prepare("UPDATE parent_invitations SET status = ?, responded_at = datetime('now') WHERE id = ?").run(accept ? 'accepted' : 'declined', invitationId);
    return true;
  }).immediate();
}
