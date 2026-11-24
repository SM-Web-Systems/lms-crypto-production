import { query } from '../config/database.js';
import { hasPermission } from '../middleware/rbac.js';
import type { RoleSummary } from './roleSummaryService.js';
import { privilegeLevel, privilegeLevels, roleLevelsById } from './roleSecurityService.js';

/**
 * Who may see whom in user lists, search results and role reads.
 *
 * - Full directory (names, emails, roles) needs user.manage (Admin, Extended admin, Super admin).
 * - Holders of user.view_all without user.manage (lecturers) see only learners on courses they
 *   lecture, and never their email.
 * - An account whose level is above the viewer's is shown with a masked email and a single
 *   "Higher access" badge in place of the roles above the viewer's level.
 */

export const RESTRICTED_ROLE: RoleSummary = { id: 'restricted', name: 'restricted', label: 'Higher access' };

export function canSeeFullDirectory(viewerId: string): boolean {
  return hasPermission(viewerId, 'user.manage');
}

/** SQL fragment (alias u) limiting users to learners on courses the viewer lectures. */
export function lecturerLearnerScope(viewerId: string): { sql: string; params: unknown[] } {
  return {
    sql: `EXISTS (SELECT 1 FROM user_course_codes ucc
      JOIN courses c ON c.course_code = ucc.course_code
      JOIN course_lecturers cl ON cl.course_id = c.id
      WHERE ucc.user_id = u.id AND cl.user_id = ?)`,
    params: [viewerId],
  };
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

interface Visible {
  id: string;
  email?: string;
  rbacRoles?: string[];
  roleSummaries?: RoleSummary[];
  restricted?: boolean;
}

/**
 * Hide what sits above the viewer: masked email, roles above the viewer's level replaced by one
 * "Higher access" badge, and restricted: true so clients can disable role management.
 */
export function redactAboveViewer<T extends Visible>(viewerId: string, entries: T[]): T[] {
  const levels = roleLevelsById();
  const viewerLevel = privilegeLevel(viewerId, levels);
  const targetLevels = privilegeLevels(entries.map(e => e.id), levels);
  const nameLevels = new Map<string, number>();
  for (const r of query<{ id: string; name: string }>('SELECT id, name FROM roles')) nameLevels.set(r.name, levels.get(r.id) ?? 0);
  return entries.map(entry => {
    if (entry.id === viewerId || (targetLevels.get(entry.id) ?? 0) <= viewerLevel) return { ...entry, restricted: false };
    const summaries = entry.roleSummaries?.filter(r => (levels.get(r.id) ?? 0) <= viewerLevel);
    const names = entry.rbacRoles?.filter(n => (nameLevels.get(n) ?? 0) <= viewerLevel);
    return {
      ...entry,
      ...(entry.email !== undefined ? { email: maskEmail(entry.email) } : {}),
      ...(summaries ? { roleSummaries: [...summaries, RESTRICTED_ROLE] } : {}),
      ...(names ? { rbacRoles: [...names, RESTRICTED_ROLE.name] } : {}),
      restricted: true,
    };
  });
}
