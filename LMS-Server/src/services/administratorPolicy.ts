import { queryOne } from '../config/database.js';
import type { AuthRequest } from '../types/index.js';

export type AdminTier = 'admin' | 'admin-2' | 'super-admin';

/** Current explicit built-in grants define identity; capabilities still gate actions. */
export function getCurrentAdminTier(userId: string): AdminTier | null {
  const row = queryOne<{ name: AdminTier }>(
    `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.is_system = 1 AND (
       (r.id = 'role_admin' AND r.name = 'admin') OR
       (r.id = 'role_admin2' AND r.name = 'admin-2') OR
       (r.id = 'role_super_admin' AND r.name = 'super-admin'))
     ORDER BY CASE r.id WHEN 'role_super_admin' THEN 3 WHEN 'role_admin2' THEN 2 ELSE 1 END DESC LIMIT 1`,
    [userId],
  );
  return row?.name ?? null;
}

export function isAdminTier(req: AuthRequest): boolean {
  return !!req.user && getCurrentAdminTier(req.user.userId) !== null;
}
