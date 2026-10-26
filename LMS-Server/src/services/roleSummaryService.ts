import { query } from '../config/database.js';

/** Public assignment metadata only. A label never implies a capability. */
export interface RoleSummary {
  id: string;
  name: string;
  label: string;
}

export function roleSummariesForUsers(userIds: string[]): Map<string, RoleSummary[]> {
  const ids = [...new Set(userIds)];
  const summaries = new Map<string, RoleSummary[]>(ids.map(id => [id, []]));
  for (let offset = 0; offset < ids.length; offset += 400) {
    const chunk = ids.slice(offset, offset + 400);
    const rows = query<RoleSummary & { user_id: string }>(
      `SELECT ur.user_id, r.id, r.name, r.label FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id IN (${chunk.map(() => '?').join(',')})
       ORDER BY ur.user_id, r.name, r.id`, chunk);
    for (const { user_id, ...role } of rows) summaries.get(user_id)!.push(role);
  }
  return summaries;
}

export function roleSummariesForUser(userId: string): RoleSummary[] {
  return roleSummariesForUsers([userId]).get(userId)!;
}
