import { db, execute, query, queryOne } from '../config/database.js';
import { getUserRoles, hasPermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';
import { ensureLearnerProfile } from './rbacAccountService.js';

export const ROLE_PRIVILEGE_LEVEL: Record<string, number> = {
  'super-admin': 100, 'admin-2': 90, admin: 80, instructor: 70,
  sponsor: 60, employer: 50, teacher: 50, parent: 50,
  'super-student': 20, 'teaching-assistant': 15, student: 10, 'custom-user': 10,
};

export function privilegeLevel(userId: string): number {
  return Math.max(0, ...getUserRoles(userId).map(role => ROLE_PRIVILEGE_LEVEL[role] ?? 0));
}

export function assertCanModifyUser(actorId: string, targetId: string): void {
  if (actorId === targetId) {
    throw new AppError('Cannot modify your own roles', 403, ErrorCodes.FORBIDDEN);
  }
  if (privilegeLevel(targetId) >= privilegeLevel(actorId)) {
    throw new AppError('Cannot modify roles of a user with equal or higher privilege', 403, ErrorCodes.FORBIDDEN);
  }
}

export function getRoleManagementOptions(actorId: string, targetId: string) {
  if (!queryOne('SELECT id FROM users WHERE id = ?', [targetId])) {
    throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
  }
  const canModify = actorId !== targetId && privilegeLevel(targetId) < privilegeLevel(actorId);
  const assigned = query<{role_id: string}>('SELECT role_id FROM user_roles WHERE user_id = ?', [targetId]).map(r => r.role_id);
  const roles = query<{id: string; name: string; label: string; description: string | null; is_system: number; created_at: string}>(
    'SELECT id, name, label, description, is_system, created_at FROM roles ORDER BY name',
  );
  const allowed = roles.filter(r => canModify && r.name !== 'super-admin' && (ROLE_PRIVILEGE_LEVEL[r.name] ?? 0) < privilegeLevel(actorId));
  return {
    canModify,
    reason: canModify ? null : 'You can manage roles only for users below your administrative level.',
    assignableRoles: allowed.filter(r => !assigned.includes(r.id)),
    revocableRoleIds: allowed.filter(r => assigned.includes(r.id)).map(r => r.id),
  };
}

export function assertNotLastSuperAdmin(userId: string): void {
  const last = queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'super-admin'`,
  );
  if (getUserRoles(userId).includes('super-admin') && (last?.total ?? 0) <= 1) {
    throw new AppError('Cannot remove the last super-admin', 403, ErrorCodes.FORBIDDEN);
  }
}

/** Call inside the role-change transaction. Versions also invalidate untracked legacy JWTs. */
export function invalidateAuthorization(userId: string): void {
  execute('UPDATE users SET authorization_version = authorization_version + 1 WHERE id = ?', [userId]);
  execute("UPDATE active_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL", [userId]);
}

export function revokeUserRole(actorId: string, targetId: string, roleId: string): string {
  return db.transaction(() => {
    assertManagementPermission(actorId,'user.assign_role');
    assertCanModifyUser(actorId, targetId);
    const assignment = queryOne<{ name: string }>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ? AND r.id = ?`, [targetId, roleId],
    );
    if (!assignment) throw new AppError('User role assignment not found', 404, ErrorCodes.NOT_FOUND);
    if ((ROLE_PRIVILEGE_LEVEL[assignment.name] ?? 0) >= privilegeLevel(actorId)) {
      throw new AppError('Cannot remove a role with equal or higher privilege', 403, ErrorCodes.FORBIDDEN);
    }
    if (assignment.name === 'super-admin') assertNotLastSuperAdmin(targetId);
    execute('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [targetId, roleId]);
    invalidateAuthorization(targetId);
    roleAudit('rbac.role_removed',actorId,targetId,'roleId='+roleId+' roleName='+assignment.name);
    return assignment.name;
  }).immediate();
}

/** Trusted operator CLI only; never called from public registration or login. */
export function provisionAdministratorFromConsole(userId: string): boolean {
  return db.transaction(() => {
    const user = queryOne<{id:string}>('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    const assigned = queryOne("SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = 'role_admin'", [userId]);
    if (assigned) return false;
    execute("INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES(?,'role_admin')", [userId]);
    ensureLearnerProfile(userId);
    invalidateAuthorization(userId);
    roleAudit('rbac.operator_admin_granted','trusted-console',userId,'roleId=role_admin');
    return true;
  }).immediate();
}

function assertManagementPermission(actorId:string,permission:string):void {
  if (!hasPermission(actorId,permission)) throw new AppError('Insufficient permissions',403,ErrorCodes.FORBIDDEN);
}
function roleForAssignment(actorId:string,roleId:string) {
  const role=queryOne<{id:string;name:string}>('SELECT id,name FROM roles WHERE id=?',[roleId]);
  if(!role) throw new AppError('Role not found',404,ErrorCodes.NOT_FOUND);
  if(role.name==='super-admin') throw new AppError('super-admin role cannot be assigned via API',403,ErrorCodes.FORBIDDEN);
  if((ROLE_PRIVILEGE_LEVEL[role.name] ?? 0)>=privilegeLevel(actorId)) {
    throw new AppError('Cannot assign a role with equal or higher privilege than your own',403,ErrorCodes.FORBIDDEN);
  }
  return role;
}
function targetExists(targetId:string):void {
  if(!queryOne('SELECT id FROM users WHERE id=?',[targetId])) throw new AppError('User not found',404,ErrorCodes.NOT_FOUND);
}
function roleAudit(action:string,actorId:string,targetId:string,details:string):void {
  execute('INSERT INTO audit_log(action,actor_id,target_id,details) VALUES(?,?,?,?)',[action,actorId,targetId,details]);
}

export function assignUserRole(actorId:string,targetId:string,roleId:string):boolean {
  if(typeof roleId!=='string' || !roleId.trim()) throw new AppError('roleId is required',400,ErrorCodes.VALIDATION_ERROR);
  if(actorId===targetId) throw new AppError('Cannot assign roles to yourself',403,ErrorCodes.FORBIDDEN);
  return db.transaction(()=>{
    assertManagementPermission(actorId,'user.assign_role'); targetExists(targetId); assertCanModifyUser(actorId,targetId);
    const role=roleForAssignment(actorId,roleId);
    if(queryOne('SELECT 1 FROM user_roles WHERE user_id=? AND role_id=?',[targetId,roleId])) return false;
    execute('INSERT INTO user_roles(user_id,role_id,granted_by) VALUES(?,?,?)',[targetId,roleId,actorId]);
    ensureLearnerProfile(targetId); invalidateAuthorization(targetId);
    roleAudit('rbac.role_assigned',actorId,targetId,'roleId='+roleId+' roleName='+role.name);
    return true;
  }).immediate();
}

/** Explicit atomic RBAC replacement preserves safe demotion without a legacy role endpoint. */
export function replaceUserRoles(actorId:string,targetId:string,roleIds:unknown):void {
  if(!Array.isArray(roleIds) || roleIds.length>100 || roleIds.some(id=>typeof id!=='string' || !id.trim())) {
    throw new AppError('roleIds must be an array of role identifiers',400,ErrorCodes.VALIDATION_ERROR);
  }
  const ids=[...new Set(roleIds as string[])].sort();
  db.transaction(()=>{
    assertManagementPermission(actorId,'user.assign_role'); targetExists(targetId); assertCanModifyUser(actorId,targetId);
    for(const id of ids) roleForAssignment(actorId,id);
    const before=query<{role_id:string}>('SELECT role_id FROM user_roles WHERE user_id=? ORDER BY role_id',[targetId]).map(r=>r.role_id);
    if(JSON.stringify(before)===JSON.stringify(ids)) return;
    if(before.includes('role_super_admin') && !ids.includes('role_super_admin')) assertNotLastSuperAdmin(targetId);
    execute('DELETE FROM user_roles WHERE user_id=?',[targetId]);
    for(const id of ids) execute('INSERT INTO user_roles(user_id,role_id,granted_by) VALUES(?,?,?)',[targetId,id,actorId]);
    ensureLearnerProfile(targetId); invalidateAuthorization(targetId);
    roleAudit('rbac.roles_replaced',actorId,targetId,JSON.stringify({before,after:ids}));
  }).immediate();
}

export function updateCustomRolePermissions(actorId:string,roleId:string,permissionIds:unknown):void {
  if(!Array.isArray(permissionIds) || permissionIds.length>500 || permissionIds.some(id=>typeof id!=='string')) {
    throw new AppError('permissionIds must be an array',400,ErrorCodes.VALIDATION_ERROR);
  }
  const ids=[...new Set(permissionIds as string[])].sort();
  db.transaction(()=>{
    assertManagementPermission(actorId,'system.manage_roles');
    const role=queryOne<{is_system:number;name:string}>('SELECT is_system,name FROM roles WHERE id=?',[roleId]);
    if(!role) throw new AppError('Role not found',404,ErrorCodes.NOT_FOUND);
    if(role.is_system) throw new AppError('Cannot modify system role permissions',400,ErrorCodes.VALIDATION_ERROR);
    for(const id of ids) {
      const permission=queryOne<{name:string}>('SELECT name FROM permissions WHERE id=?',[id]);
      if(!permission) throw new AppError('Unknown permission',400,ErrorCodes.VALIDATION_ERROR);
      if(['system.manage_permissions','system.manage_roles'].includes(permission.name)) {
        throw new AppError('Cannot assign system management permissions to custom roles',400,ErrorCodes.VALIDATION_ERROR);
      }
    }
    const before=query<{permission_id:string}>('SELECT permission_id FROM role_permissions WHERE role_id=? ORDER BY permission_id',[roleId]).map(r=>r.permission_id);
    if(JSON.stringify(before)===JSON.stringify(ids)) return;
    const users=query<{user_id:string}>('SELECT user_id FROM user_roles WHERE role_id=?',[roleId]);
    execute('DELETE FROM role_permissions WHERE role_id=?',[roleId]);
    for(const id of ids) execute('INSERT INTO role_permissions(role_id,permission_id) VALUES(?,?)',[roleId,id]);
    for(const {user_id} of users) { ensureLearnerProfile(user_id); invalidateAuthorization(user_id); }
    roleAudit('rbac.permissions_updated',actorId,roleId,JSON.stringify({before,after:ids,permissionCount:ids.length}));
  }).immediate();
}

export function deleteCustomRole(actorId:string,roleId:string):void {
  db.transaction(()=>{
    assertManagementPermission(actorId,'system.manage_roles');
    const role=queryOne<{is_system:number;name:string}>('SELECT is_system,name FROM roles WHERE id=?',[roleId]);
    if(!role) throw new AppError('Role not found',404,ErrorCodes.NOT_FOUND);
    if(role.is_system) throw new AppError('Cannot delete system roles',400,ErrorCodes.VALIDATION_ERROR);
    const users=query<{user_id:string}>('SELECT user_id FROM user_roles WHERE role_id=?',[roleId]);
    execute('DELETE FROM user_roles WHERE role_id=?',[roleId]);
    execute('DELETE FROM role_permissions WHERE role_id=?',[roleId]);
    execute('DELETE FROM roles WHERE id=?',[roleId]);
    for(const {user_id} of users) invalidateAuthorization(user_id);
    roleAudit('rbac.role_deleted',actorId,roleId,'name='+role.name);
  }).immediate();
}
