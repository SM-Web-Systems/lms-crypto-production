import { Response, NextFunction } from 'express';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, UserDirectoryItem, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

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
    const row = queryOne<{ id: string; name: string; email: string; role: string }>(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [id]
    );
    if (!row) {
      throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    }
    // Only expose email to the user themselves or admins
    const caller = req.user;
    const exposedEmail = caller?.userId === id || caller?.role === 'admin' ? row.email : undefined;
    res.json({
      success: true,
      data: {
        id: row.id,
        displayName: row.name,
        email: exposedEmail,
        role: row.role,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = query<{ id: string; name: string; email: string; role: string }>(
      'SELECT id, name, email, role FROM users ORDER BY name'
    );
    const users: UserDirectoryItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as UserDirectoryItem['role'],
      courseCodes: getUserCourseCodes(r.id),
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
