import { Response, NextFunction } from 'express';
import { query, queryOne } from '../config/database.js';
import { AuthRequest, ErrorCodes, UserRole } from '../types/index.js';
import { AppError } from './errorHandler.js';
import { isAdminTier } from '../services/administratorPolicy.js';
import { canAccessCourse } from '../services/courseAccessService.js';

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

const permissionCache = new WeakMap<AuthRequest, { userId: string; permissions: Set<string> }>();

/** Only this loader owns the cache; never trust a prefilled assertion or another user. */
export function getRequestPermissions(req: AuthRequest): Set<string> {
  if (!req.user) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
  const cached = permissionCache.get(req);
  if (cached?.userId === req.user.userId) return cached.permissions;
  const permissions = new Set(getUserPermissions(req.user.userId));
  permissionCache.set(req, { userId: req.user.userId, permissions });
  req._permissions = permissions;
  return permissions;
}

export function requireAdministrator(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({success:false,error:{code:ErrorCodes.UNAUTHORIZED,message:'Authentication required'}}); return; }
  if (!isAdminTier(req)) { res.status(403).json({success:false,error:{code:ErrorCodes.FORBIDDEN,message:'Administrator role required'}}); return; }
  next();
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

    const currentPermissions = getRequestPermissions(req);
    const missing = permissions.filter((p) => !currentPermissions.has(p));
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
 * Checks current RBAC permissions and resource assignments to determine course access:
 *   1. Explicit administrator grant plus course.delete → platform/administered-tenant scope.
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

  const permissions = getRequestPermissions(req);

  if (!queryOne('SELECT id FROM courses WHERE id = ?', [courseId])) {
    res.status(404).json({success:false,error:{code:ErrorCodes.NOT_FOUND,message:'Course not found'}});
    return;
  }
  if (canAccessCourse(req.user.userId, courseId, permissions, 'staff')) {
    next();
    return;
  }

  // 4. No matching permission or assignment — deny
  res.status(403).json({
    success: false,
    error: { code: ErrorCodes.FORBIDDEN, message: 'Not authorized to access this course' },
  });
}

/** Staff management excludes TA-only access and honors tenant boundaries. */
export function requireCourseManagementScope(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({success:false,error:{code:ErrorCodes.UNAUTHORIZED,message:'Authentication required'}}); return; }
  const courseId = req.params.id;
  if (!queryOne('SELECT id FROM courses WHERE id = ?', [courseId])) {
    res.status(404).json({success:false,error:{code:ErrorCodes.NOT_FOUND,message:'Course not found'}}); return;
  }
  const permissions = getRequestPermissions(req);
  if (!canAccessCourse(req.user.userId, courseId, permissions, 'manage')) {
    res.status(403).json({success:false,error:{code:ErrorCodes.FORBIDDEN,message:'Not authorized to manage this course'}}); return;
  }
  next();
}
