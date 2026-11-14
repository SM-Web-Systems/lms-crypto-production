import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';

/**
 * A teacher can only invite a learner to a class. The learner becomes a member (and so visible to the
 * teacher, and part of reward audiences) only after accepting. Declining or ignoring changes nothing.
 */

export interface PendingInvitation { id: string; className: string; invitedBy: string; createdAt: string }
export type InviteResult = 'invited' | 'already_member' | 'already_invited' | 'not_found';

const ownsClass = (groupId: string, ownerId: string) =>
  !!db.prepare("SELECT 1 FROM user_groups WHERE id = ? AND owner_user_id = ? AND group_type = 'class'").get(groupId, ownerId);

export function ownsClassGroup(groupId: string, ownerId: string): boolean { return ownsClass(groupId, ownerId); }

/** Only active learners can be invited. The caller must not reveal which case happened. */
export function inviteLearner(groupId: string, ownerId: string, email: string): InviteResult {
  if (!ownsClass(groupId, ownerId)) return 'not_found';
  return db.transaction((): InviteResult => {
    const learner = db.prepare(`SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = 'role_student'
      WHERE lower(u.email) = lower(?) AND COALESCE(u.deletion_status, '') NOT IN ('pending_deletion', 'finalized') LIMIT 1`).get(email.trim()) as { id: string } | undefined;
    if (!learner || learner.id === ownerId) return 'not_found';
    if (db.prepare('SELECT 1 FROM user_group_members WHERE group_id = ? AND user_id = ?').get(groupId, learner.id)) return 'already_member';
    if (db.prepare("SELECT 1 FROM class_invitations WHERE group_id = ? AND invited_user_id = ? AND status = 'pending'").get(groupId, learner.id)) return 'already_invited';
    db.prepare("INSERT INTO class_invitations (id, group_id, invited_user_id, invited_by, status) VALUES (?, ?, ?, ?, 'pending')")
      .run(uuidv4(), groupId, learner.id, ownerId);
    return 'invited';
  }).immediate();
}

export function listClassInvitations(groupId: string, ownerId: string) {
  if (!ownsClass(groupId, ownerId)) return null;
  return db.prepare(`SELECT i.id, i.status, i.created_at AS createdAt, i.responded_at AS respondedAt, u.name, u.email
    FROM class_invitations i JOIN users u ON u.id = i.invited_user_id
    WHERE i.group_id = ? ORDER BY i.created_at DESC LIMIT 200`).all(groupId);
}

export function cancelClassInvitation(groupId: string, ownerId: string, invitationId: string): boolean {
  if (!ownsClass(groupId, ownerId)) return false;
  return db.prepare("UPDATE class_invitations SET status = 'cancelled', responded_at = datetime('now') WHERE id = ? AND group_id = ? AND status = 'pending'")
    .run(invitationId, groupId).changes > 0;
}

export function myPendingInvitations(userId: string): PendingInvitation[] {
  return db.prepare(`SELECT i.id, g.name AS className, t.name AS invitedBy, i.created_at AS createdAt
    FROM class_invitations i
    JOIN user_groups g ON g.id = i.group_id
    JOIN users t ON t.id = i.invited_by
    WHERE i.invited_user_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC LIMIT 50`).all(userId) as PendingInvitation[];
}

/** Accept or decline one of my own pending invitations. Returns false when it is not mine or not pending. */
export function respondToInvitation(userId: string, invitationId: string, accept: boolean): boolean {
  return db.transaction(() => {
    const invitation = db.prepare("SELECT group_id FROM class_invitations WHERE id = ? AND invited_user_id = ? AND status = 'pending'")
      .get(invitationId, userId) as { group_id: string } | undefined;
    if (!invitation) return false;
    if (accept) db.prepare('INSERT OR IGNORE INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(invitation.group_id, userId);
    db.prepare("UPDATE class_invitations SET status = ?, responded_at = datetime('now') WHERE id = ?").run(accept ? 'accepted' : 'declined', invitationId);
    return true;
  }).immediate();
}
