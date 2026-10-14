import { Response, NextFunction } from 'express';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, UserDirectoryItem, ErrorCodes, LegacyRole } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditLog } from '../services/auditService.js';
import { getUserRoles, getUserPermissions } from '../middleware/rbac.js';

/**
 * Privilege levels for legacy roles, aligned with the RBAC hierarchy in rbac.ts.
 * Used by patchUserRole() to enforce escalation guards on the legacy users.role column.
 */
const LEGACY_ROLE_PRIVILEGE: Record<string, number> = {
  'student': 10,
  'lecturer': 70,  // maps to RBAC 'instructor' (level 70)
  'admin': 80,     // maps to RBAC 'admin' (level 80)
};

/**
 * RBAC role-name → privilege level (same as rbac.ts ROLE_PRIVILEGE_LEVEL).
 * Duplicated here to avoid circular dependency with the routes layer.
 */
const ROLE_PRIVILEGE_LEVEL: Record<string, number> = {
  'super-admin': 100,
  'admin-2': 90,
  'admin': 80,
  'instructor': 70,
  'sponsor': 60,
  'employer': 50,
  'teacher': 50,
  'parent': 50,
  'super-student': 20,
  'teaching-assistant': 15,
  'student': 10,
  'custom-user': 10,
};

function getUserCourseCodes(userId: string): string[] {
  const rows = query<{ course_code: string }>(
    'SELECT course_code FROM user_course_codes WHERE user_id = ? ORDER BY course_code',
    [userId]
  );
  return rows.map((r) => r.course_code);
}

export async function getMyCourses(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const codes = getUserCourseCodes(userId);
    const courseIds = codes.length === 0
      ? []
      : query<{ id: string }>(
          `SELECT id FROM courses WHERE course_code IN (${codes.map(() => '?').join(',')}) ORDER BY title`,
          codes
        ).map((r) => r.id);

    res.json({
      success: true,
      data: { courseIds },
    });
  } catch (error) {
    next(error);
  }
}

export async function getUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const callerId = req.user?.userId;
    if (!callerId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const row = queryOne<{ id: string; name: string; email: string; role: string }>(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [id]
    );
    if (!row) {
      throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Self-access: always allowed, full profile
    if (callerId === id) {
      res.json({
        success: true,
        data: { id: row.id, displayName: row.name, email: row.email, role: row.role },
      });
      return;
    }

    // RBAC-based access for viewing other users' profiles
    const callerPerms = new Set(getUserPermissions(callerId));

    // Admin (user.manage): full access with email
    if (callerPerms.has('user.manage')) {
      res.json({
        success: true,
        data: { id: row.id, displayName: row.name, email: row.email, role: row.role },
      });
      return;
    }

    // Instructor (user.view_all, no user.manage): course-scoped, limited fields
    if (callerPerms.has('user.view_all')) {
      const inScope = queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt
         FROM user_course_codes ucc
         JOIN courses c ON c.course_code = ucc.course_code
         JOIN course_lecturers cl ON cl.course_id = c.id
         WHERE ucc.user_id = ? AND cl.user_id = ?`,
        [id, callerId],
      );
      if ((inScope?.cnt ?? 0) > 0) {
        res.json({
          success: true,
          data: { id: row.id, displayName: row.name, role: row.role },
        });
        return;
      }
      throw new AppError('Access denied', 403, ErrorCodes.FORBIDDEN);
    }

    // Sponsor (student.view_assigned): cohort-scoped, limited fields
    if (callerPerms.has('student.view_assigned')) {
      const inCohort = queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt
         FROM cohort_members cm
         JOIN sponsor_cohorts sc ON sc.id = cm.cohort_id
         WHERE cm.user_id = ? AND sc.sponsor_user_id = ?`,
        [id, callerId],
      );
      if ((inCohort?.cnt ?? 0) > 0) {
        res.json({
          success: true,
          data: { id: row.id, displayName: row.name, role: row.role },
        });
        return;
      }
      throw new AppError('Access denied', 403, ErrorCodes.FORBIDDEN);
    }

    // All other roles: denied
    throw new AppError('Access denied', 403, ErrorCodes.FORBIDDEN);
  } catch (error) {
    next(error);
  }
}

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = query<{ id: string; name: string; email: string; role: string }>(
      'SELECT id, name, email, role FROM users ORDER BY name'
    );

    // LMS-ADM-007: batch course code lookup to eliminate N+1
    const allCodes = query<{ user_id: string; course_code: string }>(
      'SELECT user_id, course_code FROM user_course_codes ORDER BY course_code'
    );
    const codeMap = new Map<string, string[]>();
    for (const { user_id, course_code } of allCodes) {
      if (!codeMap.has(user_id)) codeMap.set(user_id, []);
      codeMap.get(user_id)!.push(course_code);
    }

    const users: UserDirectoryItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as UserDirectoryItem['role'],
      courseCodes: codeMap.get(r.id) || [],
    }));

    res.json({
      success: true,
      data: { users },
    });
  } catch (error) {
    next(error);
  }
}

export async function patchUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let targetUserId = req.params.id;
    const { courseCodes } = req.body ?? {};

    // Resolve: frontend may send student.id instead of users.id
    let user = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [targetUserId]);
    if (!user) {
      const student = queryOne<{ user_id: string }>('SELECT user_id FROM students WHERE id = ?', [targetUserId]);
      if (student?.user_id) {
        targetUserId = student.user_id;
        user = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [targetUserId]);
      }
    }
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (courseCodes === undefined) {
      const current = getUserCourseCodes(targetUserId);
      res.json({
        success: true,
        data: { id: targetUserId, courseCodes: current },
      });
      return;
    }

    if (!Array.isArray(courseCodes)) {
      throw new AppError('courseCodes must be an array', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const normalized = (courseCodes as string[]).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    const unique = [...new Set(normalized)];

    for (const code of unique) {
      const exists = queryOne<{ id: string }>('SELECT id FROM courses WHERE course_code = ?', [code]);
      if (!exists) {
        throw new AppError(`Course code "${code}" does not exist`, 400, ErrorCodes.VALIDATION_ERROR);
      }
    }

    execute('DELETE FROM user_course_codes WHERE user_id = ?', [targetUserId]);
    for (const code of unique) {
      execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [targetUserId, code]);
    }

    res.json({
      success: true,
      data: { id: targetUserId, courseCodes: unique },
    });
  } catch (error) {
    next(error);
  }
}

// ── Role management (Phase C) ─────────────────────────────────────────────────

export async function patchUserRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body ?? {};
    const callerId = req.user?.userId;

    const validRoles: LegacyRole[] = ['student', 'lecturer', 'admin'];
    if (!role || !validRoles.includes(role as LegacyRole)) {
      throw new AppError(
        `role must be one of: ${validRoles.join(', ')}`,
        400,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    if (id === callerId) {
      throw new AppError('Cannot change your own role', 400, ErrorCodes.VALIDATION_ERROR);
    }

    // WI-02: Privilege-escalation guard — caller cannot assign a legacy role
    // whose privilege level is >= their own highest RBAC privilege level.
    const callerRoles = getUserRoles(callerId!);
    const callerLevel = Math.max(0, ...callerRoles.map((r) => ROLE_PRIVILEGE_LEVEL[r] ?? 0));
    const targetLevel = LEGACY_ROLE_PRIVILEGE[role] ?? 0;
    if (targetLevel >= callerLevel) {
      throw new AppError(
        'Cannot assign a role with equal or higher privilege than your own',
        403,
        ErrorCodes.FORBIDDEN,
      );
    }

    const user = queryOne<{ id: string; email: string; role: string }>(
      'SELECT id, email, role FROM users WHERE id = ?',
      [id],
    );
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    }

    execute(
      `UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`,
      [role, id],
    );

    // LMS-ADM-006: audit log for role change
    auditLog({
      action: 'CHANGE_ROLE',
      actorId: callerId ?? 'unknown',
      targetId: id,
      details: `oldRole=${user.role} newRole=${role} email=${user.email}`,
    });

    res.json({
      success: true,
      data: { userId: id, email: user.email, role },
    });
  } catch (error) {
    next(error);
  }
}
