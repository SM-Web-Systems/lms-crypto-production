import { Response, NextFunction } from 'express';
import { query } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

// Augment AuthRequest for per-request permission/role caching
declare module '../types/index.js' {
  interface AuthRequest {
    _permissions?: Set<string>;
    _roles?: string[];
  }
}

/**
 * Fetch all permissions for a user across all their roles (UNION).
 * Result is cached on req._permissions for the duration of the request.
 */
export function getUserPermissions(userId: string): string[] {
  const rows = query<{ name: string }>(
    `SELECT DISTINCT p.name
     FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     JOIN user_roles ur ON rp.role_id = ur.role_id
     WHERE ur.user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.name);
}

/**
 * Fetch all role names for a user.
 */
export function getUserRoles(userId: string): string[] {
  const rows = query<{ name: string }>(
    `SELECT r.name
     FROM roles r
     JOIN user_roles ur ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.name);
}

/**
 * Check if a user has a specific permission (across all roles).
 */
export function hasPermission(userId: string, permission: string): boolean {
  const perms = getUserPermissions(userId);
  return perms.includes(permission);
}

/**
 * Check if a list of user roles includes any of the required roles.
 */
export function hasAnyRole(userRoles: string[], requiredRoles: string[]): boolean {
  return requiredRoles.some((r) => userRoles.includes(r));
}

/**
 * Middleware: require the authenticated user to have ALL specified permissions.
 * Uses per-request caching to avoid duplicate DB queries.
 */
export function requirePermission(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: ErrorCodes.UNAUTHORIZED, message: 'Authentication required' },
      });
      return;
    }

    // Per-request cache
    if (!req._permissions) {
      const permList = getUserPermissions(req.user.userId);
      req._permissions = new Set(permList);
    }

    const missing = permissions.filter((p) => !req._permissions!.has(p));
    if (missing.length > 0) {
      res.status(403).json({
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: 'Insufficient permissions',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: require the authenticated user to have at least one of the specified roles.
 * Uses per-request caching.
 */
export function requireAnyRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: ErrorCodes.UNAUTHORIZED, message: 'Authentication required' },
      });
      return;
    }

    // Per-request cache
    if (!req._roles) {
      req._roles = getUserRoles(req.user.userId);
    }

    if (!hasAnyRole(req._roles, roles)) {
      res.status(403).json({
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: 'You do not have permission to access this resource',
        },
      });
      return;
    }

    next();
  };
}
