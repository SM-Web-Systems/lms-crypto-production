/**
 * Course progress routes.
 * Mounted at /api/v1 (full paths include /courses/:courseId/progress...).
 *
 * GET /courses/:courseId/progress
 *   — any authenticated user: own progress
 * GET /courses/:courseId/progress/all
 *   — admin / assigned lecturer: progress for all enrolled students
 * GET /courses/:courseId/students/:userId/progress
 *   — admin / assigned lecturer: progress for a specific student
 *
 * Route order matters: /progress/all must be registered BEFORE
 * /students/:userId/progress to avoid "all" being matched as a :userId.
 */

import { Router, Response } from 'express';
import { authenticate, requireCourseAccess } from '../middleware/auth.js';
import { queryOne, query } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { getCourseProgress } from '../services/courseCompletionService.js';

const router = Router();

// ─── GET /courses/:courseId/progress (own) ────────────────────────────────────
router.get(
  '/courses/:courseId/progress',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { courseId } = req.params;

    const course = queryOne<{ id: string }>(
      'SELECT id FROM courses WHERE id = ?',
      [courseId]
    );
    if (!course) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' },
      });
      return;
    }

    const progress = getCourseProgress(userId, courseId);
    res.json({ success: true, data: progress });
  }
);

// ─── GET /courses/:courseId/progress/all (all students — admin/lecturer) ──────
// Registered BEFORE /students/:userId/progress so "all" is not treated as :userId.
router.get(
  '/courses/:courseId/progress/all',
  authenticate,
  requireCourseAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { courseId } = req.params;

    const course = queryOne<{ id: string; course_code: string }>(
      'SELECT id, course_code FROM courses WHERE id = ?',
      [courseId]
    );
    if (!course) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' },
      });
      return;
    }

    const enrolledUsers = query<{ id: string }>(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_course_codes ucc ON ucc.user_id = u.id
       WHERE ucc.course_code = ?`,
      [course.course_code]
    );

    const progress = enrolledUsers.map(({ id: uid }) => getCourseProgress(uid, courseId));
    res.json({ success: true, data: { progress } });
  }
);

// ─── GET /courses/:courseId/students/:userId/progress (specific student) ───────
router.get(
  '/courses/:courseId/students/:userId/progress',
  authenticate,
  requireCourseAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { courseId, userId } = req.params;

    const course = queryOne<{ id: string }>(
      'SELECT id FROM courses WHERE id = ?',
      [courseId]
    );
    if (!course) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' },
      });
      return;
    }

    const targetUser = queryOne<{ id: string }>(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );
    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'User not found' },
      });
      return;
    }

    const progress = getCourseProgress(userId, courseId);
    res.json({ success: true, data: progress });
  }
);

export default router;
