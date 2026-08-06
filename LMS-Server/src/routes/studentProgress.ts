/**
 * GET /api/v1/students/me/progress
 *
 * Returns the authenticated student's progress across all enrolled courses,
 * including lesson completion, required quizzes, and certificate status.
 * Used by the Student Progress page (L-006).
 */

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import { query, queryOne } from '../config/database.js';
import { getCourseProgress } from '../services/courseCompletionService.js';

const router = Router();

/**
 * @openapi
 * /students/me/progress:
 *   get:
 *     tags: [Students]
 *     summary: Get own progress across all enrolled courses
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Progress per course with cert status }
 */
router.get('/students/me/progress', authenticate, (req: AuthRequest, res: Response): void => {
  const userId = req.user!.userId;

  // All courses this student is enrolled in
  const enrolled = query<{ id: string; title: string; course_code: string | null }>(
    `SELECT c.id, c.title, c.course_code
     FROM courses c
     JOIN user_course_codes ucc ON ucc.course_code = c.course_code
     WHERE ucc.user_id = ?
     ORDER BY c.title`,
    [userId]
  );

  const result = enrolled.map((course) => {
    const progress = getCourseProgress(userId, course.id);

    // Most recent application for this course
    const app = queryOne<{
      id: string;
      status: string;
      applied_at: string;
      tx_hash: string | null;
    }>(
      `SELECT id, status, applied_at, tx_hash
       FROM course_nft_applications
       WHERE user_id = ? AND course_id = ?
       ORDER BY applied_at DESC LIMIT 1`,
      [userId, course.id]
    );

    const certStatus = app
      ? (app.status as 'pending' | 'approved' | 'minted' | 'rejected')
      : progress.canApplyForCertificate
        ? 'eligible'
        : 'not_eligible';

    return {
      courseId: course.id,
      courseName: course.title,
      courseCode: course.course_code,
      lessonsCompleted: progress.completedLessonItems,
      totalLessons: progress.totalLessonItems,
      lessonPercentage: progress.lessonPercentage,
      requiredQuizzes: progress.requiredQuizzes,
      allRequiredQuizzesPassed: progress.allRequiredQuizzesPassed,
      hasApprovedSubmission: progress.hasApprovedSubmission,
      meetsAllRequirements: progress.meetsAllRequirements,
      canApplyForCertificate: progress.canApplyForCertificate,
      certificateStatus: certStatus,
      applicationId: app?.id ?? null,
      txHash: app?.tx_hash ?? null,
    };
  });

  res.json({ success: true, data: { courses: result } });
});

export default router;
