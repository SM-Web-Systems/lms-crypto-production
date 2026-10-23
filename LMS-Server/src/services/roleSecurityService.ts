import { db, execute, query, queryOne } from '../config/database.js';
import { getUserRoles } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { ErrorCodes, type LegacyRole } from '../types/index.js';

export const ROLE_PRIVILEGE_LEVEL: Record<string, number> = {
  'super-admin': 100, 'admin-2': 90, admin: 80, instructor: 70,
  sponsor: 60, employer: 50, teacher: 50, parent: 50,
  'super-student': 20, 'teaching-assistant': 15, student: 10, 'custom-user': 10,
};

export const LEGACY_RBAC_ROLE: Record<LegacyRole, string> = {
  student: 'role_student', lecturer: 'role_instructor', admin: 'role_admin',
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
    // Legacy claims must not continue to grant course/admin bypasses after revocation.
    const remaining = getUserRoles(targetId);
    const legacy: LegacyRole = remaining.some(r => ['admin', 'admin-2', 'super-admin'].includes(r))
      ? 'admin' : remaining.includes('instructor') ? 'lecturer' : 'student';
    execute("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?", [legacy, targetId]);
    invalidateAuthorization(targetId);
    return assignment.name;
  }).immediate();
}

/** Trusted operator CLI only; never called from public registration or login. */
export function provisionAdministratorFromConsole(userId: string): boolean {
  return db.transaction(() => {
    const user = queryOne<{role: LegacyRole}>('SELECT role FROM users WHERE id = ?', [userId]);
    if (!user) throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    const assigned = queryOne("SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = 'role_admin'", [userId]);
    if (assigned && user.role === 'admin') return false;
    execute("INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES(?,'role_admin')", [userId]);
    execute("UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE id = ?", [userId]);
    invalidateAuthorization(userId);
    return true;
  }).immediate();
}
