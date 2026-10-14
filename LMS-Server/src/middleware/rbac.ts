import { Response, NextFunction } from 'express';
import { query, queryOne } from '../config/database.js';
import { AuthRequest, ErrorCodes, UserRole } from '../types/index.js';

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
 * Fetch all RBAC role names for a user.
 * Returns values from the `roles.name` column (matches the UserRole union type).
 */
export function getUserRoles(userId: string): UserRole[] {
  const rows = query<{ name: string }>(
    `SELECT r.name
     FROM roles r
     JOIN user_roles ur ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.name as UserRole);
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
 * RBAC-aware replacement for legacy requireCourseAccess.
 *
 * Checks RBAC permissions (not legacy users.role) to determine course access:
 *   1. course.delete permission → admin-tier bypass (all courses).
 *      Only admin/admin-2/super-admin hold course.delete.
 *   2. course.manage permission + course_lecturers assignment → instructor scope
 *   3. course.grade_pending permission + course_tas assignment → TA scope
 *   4. Otherwise → 403
 *
 * Expects req.params.courseId to be set. Must be used after authenticate().
 *
 * @see WI-01 in 2026-10-13-rbac-developer-spec.md
 */
export function requireCourseScope(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: ErrorCodes.UNAUTHORIZED, message: 'Authentication required' },
    });
    return;
  }

  const courseId = req.params.courseId;
  if (!courseId) {
    res.status(400).json({
      success: false,
      error: { code: ErrorCodes.VALIDATION_ERROR, message: 'courseId param required' },
    });
    return;
  }

  // Per-request cache
  if (!req._permissions) {
    const permList = getUserPermissions(req.user.userId);
    req._permissions = new Set(permList);
  }

  // 1. Admin-tier bypass: course.delete is held only by admin/admin-2/super-admin
  if (req._permissions.has('course.delete')) {
    next();
    return;
  }

  // 2. Instructor: course.manage grants access to assigned courses only
  if (req._permissions.has('course.manage')) {
    const assigned = queryOne<{ course_id: string }>(
      'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
      [courseId, req.user.userId],
    );
    if (assigned) {
      next();
      return;
    }
  }

  // 3. TA: course.grade_pending grants access to assigned courses only
  if (req._permissions.has('course.grade_pending')) {
    const assigned = queryOne<{ course_id: string }>(
      'SELECT course_id FROM course_tas WHERE course_id = ? AND user_id = ?',
      [courseId, req.user.userId],
    );
    if (assigned) {
      next();
      return;
    }
  }

  // 4. No matching permission or assignment — deny
  res.status(403).json({
    success: false,
    error: { code: ErrorCodes.FORBIDDEN, message: 'Not authorized to access this course' },
  });
}
