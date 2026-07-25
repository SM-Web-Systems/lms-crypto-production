import { Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt.js';
import { queryOne } from '../config/database.js';
import { AuthRequest, ErrorCodes, UserRole } from '../types/index.js';

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Missing or invalid authorization header',
        },
      });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const payload = verifyToken(token);

      // Reject tokens issued before the last password reset.
      // One indexed SELECT by PK — negligible cost on SQLite.
      const row = queryOne<{ password_changed_at: string | null }>(
        'SELECT password_changed_at FROM users WHERE id = ?',
        [payload.userId],
      );
      if (row?.password_changed_at) {
        const changedEpoch =
          new Date(row.password_changed_at.replace(' ', 'T') + 'Z').getTime() / 1000;
        if ((payload.iat ?? 0) < changedEpoch) {
          res.status(401).json({
            success: false,
            error: {
              code: ErrorCodes.UNAUTHORIZED,
              message: 'Session expired after password change. Please log in again.',
            },
          });
          return;
        }
      }

      req.user = payload;
      next();
    } catch {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Invalid or expired token',
        },
      });
    }
  } catch (error) {
    next(error);
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Authentication required',
        },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
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

/** requireCourseAccess — used on lecturer-scoped routes.
 *  - admin: always passes
 *  - lecturer: passes only if assigned to req.params.courseId in course_lecturers
 *  - student: always 403
 *
 *  Must be used after authenticate(). Expects req.params.courseId. */
export function requireCourseAccess(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: ErrorCodes.UNAUTHORIZED, message: 'Authentication required' },
    });
    return;
  }

  if (req.user.role === 'admin') {
    next();
    return;
  }

  if (req.user.role !== 'lecturer') {
    res.status(403).json({
      success: false,
      error: { code: ErrorCodes.FORBIDDEN, message: 'Lecturer or admin access required' },
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

  const assigned = queryOne<{ course_id: string }>(
    'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
    [courseId, req.user.userId],
  );

  if (!assigned) {
    res.status(403).json({
      success: false,
      error: { code: ErrorCodes.FORBIDDEN, message: 'Not assigned to this course' },
    });
    return;
  }

  next();
}

