import { query } from '../config/database.js';
import type { LegacyRole } from '../types/index.js';
import { roleSummariesForUsers } from './roleSummaryService.js';

/** Temporary response/claim adapter for supported older clients. Never an access check. */
export function compatibleRoleSummaries(userIds:string[]) {
  const ids=[...new Set(userIds)];
  const assignments = roleSummariesForUsers(ids);
  const summaries=new Map(ids.map(id=>[id,{role:'student' as LegacyRole,rbacRoles:[] as string[],roleSummaries:assignments.get(id)!}]));
  const administrators:Record<string,string>={role_admin:'admin',role_admin2:'admin-2',role_super_admin:'super-admin'};
  for(let offset=0;offset<ids.length;offset+=400) {
    const chunk=ids.slice(offset,offset+400);
    const rows=query<{user_id:string;id:string;name:string;is_system:number;can_manage:number}>(
      `SELECT ur.user_id,r.id,r.name,r.is_system,EXISTS(
        SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
        WHERE rp.role_id=r.id AND p.name='course.manage') AS can_manage
       FROM user_roles ur JOIN roles r ON r.id=ur.role_id
       WHERE ur.user_id IN (${chunk.map(()=>'?').join(',')}) ORDER BY ur.user_id,r.name`,chunk);
    for(const row of rows) {
      const summary=summaries.get(row.user_id)!;
      summary.rbacRoles.push(row.name);
      if(row.is_system===1 && Object.hasOwn(administrators,row.id) && administrators[row.id]===row.name) summary.role='admin';
      else if(summary.role!=='admin' && row.can_manage) summary.role='lecturer';
    }
  }
  // A display default confers no grant/workspace. Zero-role accounts stay denied.
  return summaries;
}

export function compatibleRole(userId: string): LegacyRole {
  return compatibleRoleSummary(userId).role;
}

export function compatibleRoleSummary(userId: string) {
  return compatibleRoleSummaries([userId]).get(userId)!;
}
