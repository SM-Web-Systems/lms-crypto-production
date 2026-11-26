import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { learnerIdForEmail } from './classInvitationService.js';
import { createNotification } from './notificationService.js';
import logger from '../utils/logger.js';

/**
 * F7 (user decision 26 Nov 2026): a sponsor may invite learners to their OWN cohort by email, and the learner
 * joins only after accepting. Accepting also gives the learner the course code, because joining the cohort is
 * joining its course. Admins keep the direct add/invite they already had.
 */

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invites learner accounts by email. To avoid revealing who has an account, every valid address counts as sent. */
export function sponsorInviteToCohort(cohortId: string, sponsorId: string, emails: string[]): { sent: number; invalid: string[] } | null {
  const cohort = db.prepare("SELECT id, name, status FROM sponsor_cohorts WHERE id = ? AND sponsor_user_id = ?").get(cohortId, sponsorId) as
    { id: string; name: string; status: string } | undefined;
  if (!cohort) return null;
  const invalid: string[] = [];
  let sent = 0;
  for (const raw of emails.slice(0, 200)) {
    const email = String(raw ?? '').trim().toLowerCase();
    if (!emailRegex.test(email)) { invalid.push(email); continue; }
    sent++;
    const learnerId = learnerIdForEmail(email);
    if (!learnerId || learnerId === sponsorId) continue;
    const created = db.transaction(() => {
      if (db.prepare('SELECT 1 FROM cohort_members WHERE cohort_id = ? AND user_id = ?').get(cohortId, learnerId)) return false;
      if (db.prepare("SELECT 1 FROM cohort_invitations WHERE cohort_id = ? AND invited_user_id = ? AND status = 'pending'").get(cohortId, learnerId)) return false;
      db.prepare("INSERT INTO cohort_invitations (id, cohort_id, invited_user_id, invited_by, status) VALUES (?, ?, ?, ?, 'pending')")
        .run(uuidv4(), cohortId, learnerId, sponsorId);
      return true;
    }).immediate();
    if (created) {
      try {
        createNotification({
          userId: learnerId,
          type: 'cohort_invited',
          title: 'Cohort invitation',
          body: `You have been invited to the sponsored cohort "${cohort.name}". Accept it on your dashboard to join.`,
          link: '/student',
        });
      } catch (err) {
        logger.error({ module: 'cohort-invite', err }, 'Cohort invitation notification failed');
      }
    }
  }
  return { sent, invalid };
}

export function listCohortInvitations(cohortId: string, sponsorId: string) {
  if (!db.prepare('SELECT 1 FROM sponsor_cohorts WHERE id = ? AND sponsor_user_id = ?').get(cohortId, sponsorId)) return null;
  // Names only for pending/declined people: a sponsor sees an email only once the learner has joined.
  return db.prepare(`SELECT i.id, i.status, i.created_at AS createdAt, i.responded_at AS respondedAt, u.name
    FROM cohort_invitations i JOIN users u ON u.id = i.invited_user_id
    WHERE i.cohort_id = ? ORDER BY i.created_at DESC LIMIT 200`).all(cohortId);
}

export function cancelCohortInvitation(cohortId: string, sponsorId: string, invitationId: string): boolean {
  if (!db.prepare('SELECT 1 FROM sponsor_cohorts WHERE id = ? AND sponsor_user_id = ?').get(cohortId, sponsorId)) return false;
  return db.prepare("UPDATE cohort_invitations SET status = 'cancelled', responded_at = datetime('now') WHERE id = ? AND cohort_id = ? AND status = 'pending'")
    .run(invitationId, cohortId).changes > 0;
}

export function myPendingCohortInvitations(userId: string) {
  return db.prepare(`SELECT i.id, sc.name AS className, 'cohort' AS groupType, s.name AS invitedBy, i.created_at AS createdAt
    FROM cohort_invitations i
    JOIN sponsor_cohorts sc ON sc.id = i.cohort_id
    JOIN users s ON s.id = i.invited_by
    WHERE i.invited_user_id = ? AND i.status = 'pending' ORDER BY i.created_at DESC LIMIT 50`).all(userId) as
    Array<{ id: string; className: string; groupType: 'cohort'; invitedBy: string; createdAt: string }>;
}

/** Accept or decline my own pending cohort invitation. Accepting enrols me in the cohort's course. */
export function respondToCohortInvitation(userId: string, invitationId: string, accept: boolean): boolean {
  return db.transaction(() => {
    const inv = db.prepare(`SELECT i.cohort_id, c.course_code FROM cohort_invitations i
      JOIN sponsor_cohorts sc ON sc.id = i.cohort_id JOIN courses c ON c.id = sc.course_id
      WHERE i.id = ? AND i.invited_user_id = ? AND i.status = 'pending'`).get(invitationId, userId) as
      { cohort_id: string; course_code: string | null } | undefined;
    if (!inv) return false;
    if (accept) {
      if (inv.course_code) db.prepare('INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)').run(userId, inv.course_code);
      db.prepare("INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) VALUES (?, ?, datetime('now'))").run(inv.cohort_id, userId);
    }
    db.prepare("UPDATE cohort_invitations SET status = ?, responded_at = datetime('now') WHERE id = ?").run(accept ? 'accepted' : 'declined', invitationId);
    return true;
  }).immediate();
}
