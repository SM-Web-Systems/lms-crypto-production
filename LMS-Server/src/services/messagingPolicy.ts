import { queryOne } from '../config/database.js';
import { getCurrentAdminTier } from './administratorPolicy.js';

/**
 * Who may START a conversation with whom. Replies in an existing conversation are not affected.
 *
 * Before this, any signed-in user could open a conversation with any user id. Now the two people need a
 * real relationship in the LMS: a shared course (enrolled, lecturer or TA), a class/team/family the one
 * owns and the other is in, a parent link, or a sponsor cohort. Administrators may message anyone.
 */
export function canStartConversation(callerId: string, otherId: string): boolean {
  if (!otherId || callerId === otherId) return false;
  if (!queryOne('SELECT 1 FROM users WHERE id = ?', [otherId])) return false;
  if (getCurrentAdminTier(callerId) || getCurrentAdminTier(otherId)) return true;

  const coursePeople = `
    SELECT uc.user_id, c.id AS course_id FROM user_course_codes uc JOIN courses c ON c.course_code = uc.course_code
    UNION SELECT user_id, course_id FROM course_lecturers
    UNION SELECT user_id, course_id FROM course_tas`;
  if (queryOne(
    `WITH people AS (${coursePeople})
     SELECT 1 FROM people a JOIN people b ON a.course_id = b.course_id WHERE a.user_id = ? AND b.user_id = ? LIMIT 1`,
    [callerId, otherId],
  )) return true;

  if (queryOne(
    `SELECT 1 FROM user_groups g JOIN user_group_members m ON m.group_id = g.id
     WHERE (g.owner_user_id = ? AND m.user_id = ?) OR (g.owner_user_id = ? AND m.user_id = ?) LIMIT 1`,
    [callerId, otherId, otherId, callerId],
  )) return true;

  if (queryOne(
    `SELECT 1 FROM user_links WHERE (parent_user_id = ? AND child_user_id = ?) OR (parent_user_id = ? AND child_user_id = ?) LIMIT 1`,
    [callerId, otherId, otherId, callerId],
  )) return true;

  return !!queryOne(
    `SELECT 1 FROM sponsor_cohorts sc JOIN cohort_members cm ON cm.cohort_id = sc.id
     WHERE (sc.sponsor_user_id = ? AND cm.user_id = ?) OR (sc.sponsor_user_id = ? AND cm.user_id = ?) LIMIT 1`,
    [callerId, otherId, otherId, callerId],
  );
}
