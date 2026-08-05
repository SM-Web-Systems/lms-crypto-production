/**
 * Lesson completion routes.
 * Mounted at /api/v1 (full paths include /courses/:courseId/lessons/...).
 *
 * POST /courses/:courseId/lessons/:itemId/complete
 *   — authenticated user marks own lesson item complete
 * POST /courses/:courseId/students/:userId/lessons/:itemId/complete
 *   — admin or assigned lecturer marks an item complete for a specific student
 * GET  /courses/:courseId/lessons/completions
 *   — student: own completions; admin/lecturer: all (or ?userId= filtered)
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireCourseAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { queryOne, query, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { findSectionForItem } from '../utils/courseHelpers.js';

const router = Router();

// ─── POST /courses/:courseId/lessons/:itemId/complete (self-mark) ──────────────
router.post(
  '/courses/:courseId/lessons/:itemId/complete',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const callerId = req.user!.userId;
    const role = req.user!.role;
    const { courseId, itemId } = req.params;

    const course = queryOne<{ id: string; course_code: string; sections: string }>(
      'SELECT id, course_code, sections FROM courses WHERE id = ?',
      [courseId]
    );
    if (!course) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' },
      });
      return;
    }

    // Students must be enrolled in the course
    if (role === 'student') {
      const enrolled = queryOne<{ user_id: string }>(
        'SELECT user_id FROM user_course_codes WHERE user_id = ? AND course_code = ?',
        [callerId, course.course_code]
      );
      if (!enrolled) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCodes.FORBIDDEN, message: 'Not enrolled in this course' },
        });
        return;
      }
    }

    const sectionId = findSectionForItem(course.sections, itemId);
    if (!sectionId) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Lesson item not found in course' },
      });
      return;
    }

    execute(
      `INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct)
       VALUES (?, ?, ?, ?, ?, ?, 100)
       ON CONFLICT (user_id, course_id, item_id)
       DO UPDATE SET completed_at = datetime('now'), marked_by = excluded.marked_by, progress_pct = 100
       WHERE completed_at IS NULL`,
      [uuidv4(), callerId, courseId, itemId, sectionId, callerId]
    );

    res.json({ success: true, data: { userId: callerId, courseId, itemId, sectionId } });
  }
);

// ─── POST /courses/:courseId/students/:userId/lessons/:itemId/complete ─────────
router.post(
  '/courses/:courseId/students/:userId/lessons/:itemId/complete',
  authenticate,
  requirePermission('course.grade'),
  requireCourseAccess,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const callerId = req.user!.userId;
    const { courseId, userId, itemId } = req.params;

    const course = queryOne<{ id: string; sections: string }>(
      'SELECT id, sections FROM courses WHERE id = ?',
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

    const sectionId = findSectionForItem(course.sections, itemId);
    if (!sectionId) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Lesson item not found in course' },
      });
      return;
    }

    execute(
      `INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct)
       VALUES (?, ?, ?, ?, ?, ?, 100)
       ON CONFLICT (user_id, course_id, item_id)
       DO UPDATE SET completed_at = datetime('now'), marked_by = excluded.marked_by, progress_pct = 100
       WHERE completed_at IS NULL`,
      [uuidv4(), userId, courseId, itemId, sectionId, callerId]
    );

    res.json({ success: true, data: { userId, courseId, itemId, sectionId } });
  }
);

// ─── PUT /courses/:courseId/lessons/:itemId/progress ─────────────────────────
router.put(
  '/courses/:courseId/lessons/:itemId/progress',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const callerId = req.user!.userId;
    const role = req.user!.role;
    const { courseId, itemId } = req.params;
    const { positionSeconds, progressPercent } = req.body;

    if (typeof positionSeconds !== 'number' || !Number.isInteger(positionSeconds) || positionSeconds < 0) {
      res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'positionSeconds must be an integer >= 0' } });
      return;
    }
    if (typeof progressPercent !== 'number' || !Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'progressPercent must be an integer 0-100' } });
      return;
    }

    const course = queryOne<{ id: string; course_code: string; sections: string }>(
      'SELECT id, course_code, sections FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' } });
      return;
    }

    if (role === 'student') {
      const enrolled = queryOne<{ user_id: string }>(
        'SELECT user_id FROM user_course_codes WHERE user_id = ? AND course_code = ?', [callerId, course.course_code]);
      if (!enrolled) {
        res.status(403).json({ success: false, error: { code: ErrorCodes.FORBIDDEN, message: 'Not enrolled in this course' } });
        return;
      }
    }

    const sectionId = findSectionForItem(course.sections, itemId);
    if (!sectionId) {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Lesson item not found in course' } });
      return;
    }

    execute(
      `INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, completed_at, progress_pct, last_position_s)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT (user_id, course_id, item_id)
       DO UPDATE SET progress_pct = excluded.progress_pct, last_position_s = excluded.last_position_s`,
      [uuidv4(), callerId, courseId, itemId, sectionId, callerId, progressPercent, positionSeconds]
    );

    res.json({ success: true, data: { userId: callerId, courseId, itemId, progressPercent, positionSeconds } });
  }
);

// ─── GET /courses/:courseId/lessons/completions ────────────────────────────────
router.get(
  '/courses/:courseId/lessons/completions',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const callerId = req.user!.userId;
    const role = req.user!.role;
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

    type CompletionRow = {
      user_id: string;
      course_id: string;
      item_id: string;
      section_id: string;
      completed_at: string | null;
      marked_by: string | null;
      progress_pct: number | null;
      last_position_s: number | null;
    };

    let completions: CompletionRow[];

    if (role === 'student') {
      completions = query<CompletionRow>(
        `SELECT user_id, course_id, item_id, section_id, completed_at, marked_by, progress_pct, last_position_s
         FROM lesson_completions WHERE user_id = ? AND course_id = ? ORDER BY completed_at`,
        [callerId, courseId]
      );
    } else if (role === 'lecturer') {
      // Must be assigned to this course
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [courseId, callerId]
      );
      if (!assigned) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCodes.FORBIDDEN, message: 'Not assigned to this course' },
        });
        return;
      }
      const filterUserId = req.query['userId'] as string | undefined;
      if (filterUserId) {
        completions = query<CompletionRow>(
          `SELECT user_id, course_id, item_id, section_id, completed_at, marked_by, progress_pct, last_position_s
           FROM lesson_completions WHERE user_id = ? AND course_id = ? ORDER BY completed_at`,
          [filterUserId, courseId]
        );
      } else {
        completions = query<CompletionRow>(
          `SELECT user_id, course_id, item_id, section_id, completed_at, marked_by, progress_pct, last_position_s
           FROM lesson_completions WHERE course_id = ? ORDER BY completed_at`,
          [courseId]
        );
      }
    } else {
      // admin
      const filterUserId = req.query['userId'] as string | undefined;
      if (filterUserId) {
        completions = query<CompletionRow>(
          `SELECT user_id, course_id, item_id, section_id, completed_at, marked_by, progress_pct, last_position_s
           FROM lesson_completions WHERE user_id = ? AND course_id = ? ORDER BY completed_at`,
          [filterUserId, courseId]
        );
      } else {
        completions = query<CompletionRow>(
          `SELECT user_id, course_id, item_id, section_id, completed_at, marked_by, progress_pct, last_position_s
           FROM lesson_completions WHERE course_id = ? ORDER BY completed_at`,
          [courseId]
        );
      }
    }

    res.json({ success: true, data: { completions } });
  }
);

export default router;
