import { Response, NextFunction } from 'express';
import { db, query, queryOne, execute } from '../config/database.js';
import { AuthRequest, UserDirectoryItem, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { compatibleRoleSummary, compatibleRoleSummaries } from '../services/roleCompatibilityService.js';
import { getUserPermissions } from '../middleware/rbac.js';
import { courseAccessScope } from '../services/courseAccessService.js';
import { canSeeFullDirectory, lecturerLearnerScope, redactAboveViewer } from '../services/directoryVisibilityService.js';

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

    const permissions = new Set(getUserPermissions(userId));
    if (!permissions.has('course.view')) throw new AppError('Insufficient permissions', 403, ErrorCodes.FORBIDDEN);
    const scope = courseAccessScope(userId, permissions);
    const courseIds = query<{id: string}>('SELECT c.id FROM courses c WHERE ' + scope.sql + ' ORDER BY c.title', scope.params).map(c => c.id);

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
      'SELECT id, name, email FROM users WHERE id = ?',
      [id]
    );
    if (!row) {
      throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Self-access: always allowed, full profile
    if (callerId === id) {
      res.json({
        success: true,
        data: { id: row.id, name: row.name, displayName: row.name, email: row.email, ...compatibleRoleSummary(row.id) },
      });
      return;
    }

    // RBAC-based access for viewing other users' profiles
    const callerPerms = new Set(getUserPermissions(callerId));

    // Admin (user.manage): full access with email
    if (callerPerms.has('user.manage')) {
      const [visible] = redactAboveViewer(callerId, [{ id: row.id, name: row.name, displayName: row.name, email: row.email, ...compatibleRoleSummary(row.id) }]);
      res.json({ success: true, data: visible });
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
        const [visible] = redactAboveViewer(callerId, [{ id: row.id, name: row.name, displayName: row.name, ...compatibleRoleSummary(row.id) }]);
        res.json({ success: true, data: visible });
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
        const [visible] = redactAboveViewer(callerId, [{ id: row.id, name: row.name, displayName: row.name, ...compatibleRoleSummary(row.id) }]);
        res.json({ success: true, data: visible });
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
    const viewerId = req.user!.userId;
    const full = canSeeFullDirectory(viewerId);
    // Lecturers (user.view_all without user.manage) only get learners on courses they lecture,
    // with no email; the full directory with emails and roles is for admin levels only.
    const scope = full ? { sql: '1 = 1', params: [] as unknown[] } : lecturerLearnerScope(viewerId);
    const rows = query<{ id: string; name: string; email: string }>(
      `SELECT u.id, u.name, u.email FROM users u WHERE ${scope.sql} ORDER BY u.name`, scope.params,
    );

    // LMS-ADM-007: batch course code lookup to eliminate N+1
    const allCodes = full
      ? query<{ user_id: string; course_code: string }>('SELECT user_id, course_code FROM user_course_codes ORDER BY course_code')
      : query<{ user_id: string; course_code: string }>(
        `SELECT ucc.user_id, ucc.course_code FROM user_course_codes ucc
         JOIN courses c ON c.course_code = ucc.course_code
         JOIN course_lecturers cl ON cl.course_id = c.id AND cl.user_id = ?
         ORDER BY ucc.course_code`, [viewerId]);
    const codeMap = new Map<string, string[]>();
    for (const { user_id, course_code } of allCodes) {
      if (!codeMap.has(user_id)) codeMap.set(user_id, []);
      codeMap.get(user_id)!.push(course_code);
    }

    const summaries=compatibleRoleSummaries(rows.map(row=>row.id));
    const users: UserDirectoryItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      ...(full ? { email: r.email } : {}),
      ...summaries.get(r.id)!,
      courseCodes: codeMap.get(r.id) || [],
    }));

    res.json({
      success: true,
      data: { users: redactAboveViewer(viewerId, users) },
    });
  } catch (error) {
    next(error);
  }
}

/** Normalised, de-duplicated course codes that all exist; throws a 400 otherwise. */
function validCourseCodes(courseCodes: unknown): string[] {
  if (!Array.isArray(courseCodes)) {
    throw new AppError('courseCodes must be an array', 400, ErrorCodes.VALIDATION_ERROR);
  }
  const normalized = (courseCodes as unknown[]).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  const unique = [...new Set(normalized)];
  for (const code of unique) {
    const exists = queryOne<{ id: string }>('SELECT id FROM courses WHERE course_code = ?', [code]);
    if (!exists) {
      throw new AppError(`Course code "${code}" does not exist`, 400, ErrorCodes.VALIDATION_ERROR);
    }
  }
  return unique;
}

export function getPendingCourseCodes(email: string): string[] {
  return (query<{ course_code: string }>('SELECT course_code FROM pending_course_codes WHERE email = ? COLLATE NOCASE ORDER BY course_code', [email]))
    .map((r) => r.course_code);
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
    // A student an admin added before they have an LMS account: keep the access until the account is made.
    const pendingStudent = user ? undefined
      : queryOne<{ email: string }>('SELECT email FROM students WHERE id = ? AND user_id IS NULL', [req.params.id]);
    if (!user && !pendingStudent) {
      throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (pendingStudent) {
      if (courseCodes === undefined) {
        res.json({ success: true, data: { id: req.params.id, courseCodes: getPendingCourseCodes(pendingStudent.email), pending: true } });
        return;
      }
      const codes = validCourseCodes(courseCodes);
      db.transaction(() => {
        execute('DELETE FROM pending_course_codes WHERE email = ? COLLATE NOCASE', [pendingStudent.email]);
        for (const code of codes) execute('INSERT INTO pending_course_codes (email, course_code) VALUES (?, ?)', [pendingStudent.email, code]);
      })();
      res.json({ success: true, data: { id: req.params.id, courseCodes: codes, pending: true } });
      return;
    }

    if (courseCodes === undefined) {
      const current = getUserCourseCodes(targetUserId);
      res.json({
        success: true,
        data: { id: targetUserId, courseCodes: current },
      });
      return;
    }

    const unique = validCourseCodes(courseCodes);

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

/** Retired API: explicit RBAC routes preserve multi-role grants and safe demotion. */
export function patchUserRole(_req:AuthRequest,res:Response):void {
  res.status(410).json({success:false,error:{code:'LEGACY_ROLE_ENDPOINT_RETIRED',
    message:'Use the RBAC user-role endpoints, including PUT /api/v1/admin/users/:id/roles for atomic replacement.'}});
}
