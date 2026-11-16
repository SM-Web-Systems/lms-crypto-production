import { createHash, randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import logger from '../utils/logger.js';
import { sendGroupInvitationEmail } from './emailService.js';
import { inviteLearnerById, learnerIdForEmail, ownsClassGroup } from './classInvitationService.js';
import { inviteChildById } from './parentInvitationService.js';

/**
 * Email side of parent, class and team invitations.
 *
 * - The email belongs to a learner: the in-app invitation already exists; we email them a link to their dashboard.
 * - The email has no account at all: we store an email invitation and send a sign-up link with a one-time token.
 *   When they sign up with that same email and open the link, it becomes an ordinary pending invitation, which
 *   they still accept or decline. The token proves they read that inbox; the email match stops a forwarded link
 *   from linking someone else.
 * - The email belongs to staff or a deleted account: nothing is sent. The API answer is the same in every case.
 */

export type InvitationKind = 'parent' | 'class' | 'team';
const DAY_LIMIT = 30;            // email invitations to new addresses, per inviter per 24 hours
const VALID_DAYS = 14;
const FRONTEND_URL = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

interface Context { kind: InvitationKind; targetId: string; inviterId: string; email: string }

function describe(kind: InvitationKind, targetId: string, inviterId: string): { inviterName: string; groupName: string | null } {
  const inviter = db.prepare('SELECT name FROM users WHERE id = ?').get(inviterId) as { name: string } | undefined;
  const group = kind === 'parent' ? undefined : db.prepare('SELECT name FROM user_groups WHERE id = ?').get(targetId) as { name: string } | undefined;
  return { inviterName: inviter?.name ?? 'Someone', groupName: group?.name ?? null };
}

const anyAccountFor = (email: string) => !!db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').get(email.trim());

/** Call after the in-app invitation step. Never throws and never changes the API answer. */
export function deliverInvitationEmail(ctx: Context, outcome: 'invited' | 'already_member' | 'already_linked' | 'already_invited' | 'not_found'): void {
  try {
    const email = ctx.email.trim().toLowerCase();
    const { inviterName, groupName } = describe(ctx.kind, ctx.targetId, ctx.inviterId);
    if (outcome === 'invited') {
      void sendGroupInvitationEmail({ to: email, kind: ctx.kind, inviterName, groupName, url: `${FRONTEND_URL()}/student`, newAccount: false });
      return;
    }
    if (outcome !== 'not_found' || anyAccountFor(email)) return;
    const recent = db.prepare("SELECT COUNT(*) AS n FROM email_invitations WHERE invited_by = ? AND created_at > datetime('now', '-1 day')").get(ctx.inviterId) as { n: number };
    if (recent.n >= DAY_LIMIT) return;
    const open = db.prepare("SELECT 1 FROM email_invitations WHERE kind = ? AND target_id = ? AND email = ? AND status = 'pending' AND expires_at > datetime('now')")
      .get(ctx.kind, ctx.targetId, email);
    if (open) return;
    const token = randomBytes(32).toString('base64url');
    db.prepare(`INSERT INTO email_invitations (id, kind, target_id, invited_by, email, token_hash, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now', ?))`).run(uuidv4(), ctx.kind, ctx.targetId, ctx.inviterId, email, hash(token), `+${VALID_DAYS} days`);
    void sendGroupInvitationEmail({ to: email, kind: ctx.kind, inviterName, groupName, url: `${FRONTEND_URL()}/sign-up?join=${token}`, newAccount: true });
  } catch (err) {
    logger.error({ module: 'emailInvitation', err }, 'Invitation email step failed');
  }
}

export type ClaimResult = { ok: true; kind: InvitationKind } | { ok: false; reason: 'invalid' | 'wrong_account' };

/** Turns an emailed sign-up link into a pending invitation for the signed-in learner. */
export function claimEmailInvitation(userId: string, token: string): ClaimResult {
  return db.transaction((): ClaimResult => {
    const row = db.prepare("SELECT id, kind, target_id, invited_by, email FROM email_invitations WHERE token_hash = ? AND status = 'pending' AND expires_at > datetime('now')")
      .get(hash(token)) as { id: string; kind: InvitationKind; target_id: string; invited_by: string; email: string } | undefined;
    if (!row) return { ok: false, reason: 'invalid' };
    if (learnerIdForEmail(row.email) !== userId || userId === row.invited_by) return { ok: false, reason: 'wrong_account' };
    if (row.kind === 'parent') inviteChildById(row.invited_by, userId);
    else if (ownsClassGroup(row.target_id, row.invited_by, row.kind)) inviteLearnerById(row.target_id, row.invited_by, userId);
    db.prepare("UPDATE email_invitations SET status = 'claimed', claimed_by = ?, claimed_at = datetime('now') WHERE id = ?").run(userId, row.id);
    return { ok: true, kind: row.kind };
  }).immediate();
}

/** Withdrawing an in-app invitation does not reach email invitations; this withdraws those for one target. */
export function cancelEmailInvitations(kind: InvitationKind, targetId: string, inviterId: string, email: string): number {
  return db.prepare("UPDATE email_invitations SET status = 'cancelled' WHERE kind = ? AND target_id = ? AND invited_by = ? AND email = ? AND status = 'pending'")
    .run(kind, targetId, inviterId, email.trim().toLowerCase()).changes;
}

export function listEmailInvitations(kind: InvitationKind, targetId: string, inviterId: string) {
  return db.prepare(`SELECT id, email, created_at AS createdAt, expires_at AS expiresAt FROM email_invitations
    WHERE kind = ? AND target_id = ? AND invited_by = ? AND status = 'pending' AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 200`)
    .all(kind, targetId, inviterId);
}

export function cancelEmailInvitation(kind: InvitationKind, targetId: string, inviterId: string, id: string): boolean {
  return db.prepare("UPDATE email_invitations SET status = 'cancelled' WHERE id = ? AND kind = ? AND target_id = ? AND invited_by = ? AND status = 'pending'")
    .run(id, kind, targetId, inviterId).changes > 0;
}
