/**
 * Course completion requirements routes.
 * Mounted at /api/v1/courses (alongside existing coursesRoutes).
 *
 * GET  /:courseId/requirements — admin or assigned lecturer
 * PUT  /:courseId/requirements — admin only
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, authorize, requireCourseAccess } from '../middleware/auth.js';
import { queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

const router = Router();

// GET /:courseId/requirements — admin or assigned lecturer
router.get(
  '/:courseId/requirements',
  authenticate,
  requireCourseAccess,
  (req: AuthRequest, res: Response): void => {
    const { courseId } = req.params;

    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' },
      });
      return;
    }

    const reqs = queryOne(
      'SELECT * FROM course_completion_requirements WHERE course_id = ?',
      [courseId]
    );

    res.json({ success: true, data: reqs ?? null });
  }
);

// PUT /:courseId/requirements — admin only
router.put(
  '/:courseId/requirements',
  authenticate,
  authorize('admin'),
  (req: AuthRequest, res: Response): void => {
    const { courseId } = req.params;
    const {
      requireAllLessons,
      requiredQuizIds,
      minQuizScore,
      requireSubmissions,
    } = req.body as {
      requireAllLessons?: boolean;
      requiredQuizIds?: string[];
      minQuizScore?: number;
      requireSubmissions?: boolean;
    };

    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' },
      });
      return;
    }

    if (minQuizScore !== undefined && (minQuizScore < 0 || minQuizScore > 100)) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'minQuizScore must be 0–100' },
      });
      return;
    }
    if (requiredQuizIds !== undefined && !Array.isArray(requiredQuizIds)) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'requiredQuizIds must be an array' },
      });
      return;
    }

    const existing = queryOne<{ id: string }>(
      'SELECT id FROM course_completion_requirements WHERE course_id = ?',
      [courseId]
    );

    if (existing) {
      const sets: string[] = [];
      const params: unknown[] = [];

      if (requireAllLessons !== undefined) {
        sets.push('require_all_lessons = ?');
        params.push(requireAllLessons ? 1 : 0);
      }
      if (requiredQuizIds !== undefined) {
        sets.push('required_quiz_ids = ?');
        params.push(JSON.stringify(requiredQuizIds));
      }
      if (minQuizScore !== undefined) {
        sets.push('min_quiz_score = ?');
        params.push(minQuizScore);
      }
      if (requireSubmissions !== undefined) {
        sets.push('require_submissions = ?');
        params.push(requireSubmissions ? 1 : 0);
      }

      if (sets.length > 0) {
        sets.push("updated_at = datetime('now')");
        execute(
          `UPDATE course_completion_requirements SET ${sets.join(', ')} WHERE id = ?`,
          [...params, existing.id]
        );
      }
    } else {
      execute(
        `INSERT INTO course_completion_requirements
           (id, course_id, require_all_lessons, required_quiz_ids, min_quiz_score, require_submissions)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          courseId,
          requireAllLessons ? 1 : 0,
          JSON.stringify(requiredQuizIds ?? []),
          minQuizScore ?? 70,
          requireSubmissions ? 1 : 0,
        ]
      );
    }

    const row = queryOne(
      'SELECT * FROM course_completion_requirements WHERE course_id = ?',
      [courseId]
    );
    res.json({ success: true, data: row });
  }
);

export default router;
