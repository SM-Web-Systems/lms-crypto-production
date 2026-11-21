import { Response, NextFunction } from 'express';
import path from 'path';
import { getUserPermissions } from '../middleware/rbac.js';
import { canAccessSubmission, studentRecordId, submissionStaffScope } from '../services/submissionAccessService.js';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db, query, queryOne, execute } from '../config/database.js';
import { AuthRequest, Submission, SubmissionResponse, Student, User, ErrorCodes, SubmissionStatus } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { deleteFile, getFileUrl, resolveUploadPath } from '../utils/fileUpload.js';
import { findSectionForItem } from '../utils/courseHelpers.js';
import { likeContains } from '../utils/sqlLike.js';
import { parseFlatSections } from '../utils/courseHelpers.js';
import { canAccessCourse } from '../services/courseAccessService.js';
import { createNotification } from '../services/notificationService.js';
import logger from '../utils/logger.js';
import { produceOutboxEvent, processPendingEvents } from '../services/rewards/rewardEligibilityService.js';
import { isCourseCompleteForReward } from '../services/courseCompletionService.js';

function safeName(raw: string): string {
  return path.basename(raw).replace(/[^\w\s.\-]/g, '_');
}

// Helper to convert DB submission to API response. TA review fields are added
// only for course.grade staff; learners see TA feedback only once it is approved.
function toSubmissionResponse(submission: Submission & { student_name?: string; reviewer_name?: string }, staff = false): SubmissionResponse {
  const response: SubmissionResponse = {
    id: submission.id,
    studentId: submission.student_id,
    studentName: submission.student_name || '',
    title: submission.title,
    description: submission.description,
    fileName: submission.file_name,
    fileSize: submission.file_size,
    fileUrl: getFileUrl(submission.id),
    fileMimeType: submission.file_mime_type,
    status: submission.status,
    submittedAt: submission.submitted_at as unknown as string,
    reviewedAt: submission.reviewed_at as unknown as string | undefined,
    reviewedBy: submission.reviewer_name,
    reviewedById: submission.reviewed_by_id,
    feedback: submission.feedback ?? (submission.grade_status === 'approved' ? submission.ta_feedback ?? undefined : undefined),
    courseId: submission.course_id || undefined,
    weekId: submission.week_id || undefined,
    itemId: submission.item_id || undefined,
    createdAt: submission.created_at as unknown as string,
    updatedAt: submission.updated_at as unknown as string,
  };
  if (!staff) return response;
  const sentBack = submission.grade_status === 'direct' && !!submission.review_note && submission.status === 'pending';
  return {
    ...response,
    gradeStatus: sentBack ? 'sent_back' : submission.grade_status ?? undefined,
    gradedByName: submission.graded_by_name ?? undefined,
    proposedStatus: submission.proposed_status ?? undefined,
    taFeedback: submission.ta_feedback ?? undefined,
    reviewNote: submission.review_note ?? undefined,
  };
}

export async function getSubmissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as SubmissionStatus;
    const studentId = req.query.studentId as string;
    const courseId = req.query.courseId as string;
    const gradeStatus = req.query.gradeStatus as string;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const userId = req.user!.userId;
    const staff = submissionStaffScope(userId);
    const permissions = new Set(getUserPermissions(userId));
    const showStaffFields = req.query.view !== 'own' && permissions.has('course.grade');
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (req.query.view === 'own') {
      conditions.push('s.student_id = ?'); params.push(studentRecordId(userId) ?? '');
    } else {
      if (permissions.has('course.delete') || permissions.has('course.grade') || permissions.has('course.grade_pending')) {
        conditions.push(staff.sql); params.push(...staff.params);
      } else {
        conditions.push('s.student_id = ?'); params.push(studentRecordId(userId) ?? '');
      }
    }
    if (studentId) { conditions.push('s.student_id = ?'); params.push(studentId); }

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      params.push(status);
      conditions.push(`s.status = ?`);
    }

    if (courseId) {
      params.push(courseId);
      conditions.push(`s.course_id = ?`);
    }

    if (showStaffFields && gradeStatus === 'pending_approval') {
      conditions.push(`s.grade_status = 'pending_approval' AND s.status = 'pending'`);
    }

    if (search) {
      const like = likeContains(search);
      params.push(like, like);
      conditions.push(`(s.title LIKE ? ESCAPE '\\' OR st.name LIKE ? ESCAPE '\\')`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total count
    const countResult = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM submissions s LEFT JOIN students st ON s.student_id = st.id ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // Get submissions with student name
    const submissions = query<Submission & { student_name: string; reviewer_name: string }>(
      `SELECT s.*, st.name as student_name, u.name as reviewer_name, g.name as graded_by_name
       FROM submissions s
       LEFT JOIN students st ON s.student_id = st.id
       LEFT JOIN users u ON s.reviewed_by_id = u.id
       LEFT JOIN users g ON s.graded_by = g.id
       ${whereClause}
       ORDER BY s.submitted_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: {
        submissions: submissions.map(s => toSubmissionResponse(s, showStaffFields)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const submission = queryOne<Submission & { student_name: string; reviewer_name: string }>(
      `SELECT s.*, st.name as student_name, u.name as reviewer_name
       FROM submissions s
       LEFT JOIN students st ON s.student_id = st.id
       LEFT JOIN users u ON s.reviewed_by_id = u.id
       WHERE s.id = ?`,
      [id]
    );

    if (!submission) {
      throw new AppError('Submission not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (!canAccessSubmission(req.user!.userId, id)) {
      throw new AppError('You do not have permission to view this submission', 403, ErrorCodes.FORBIDDEN);
    }

    res.json({
      success: true,
      data: toSubmissionResponse(submission),
    });
  } catch (error) {
    next(error);
  }
}

export async function createSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description, courseId, weekId, itemId } = req.body;
    const file = req.file;
    const userStudentId = studentRecordId(req.user!.userId);

    if (!userStudentId) {
      if (file) deleteFile(file.path);
      throw new AppError('Student profile not found', 403, ErrorCodes.FORBIDDEN);
    }

    // Validation
    const errors: Array<{ field: string; message: string }> = [];

    if (!title || title.trim().length === 0) {
      errors.push({ field: 'title', message: 'Title is required' });
    } else if (title.length > 200) {
      errors.push({ field: 'title', message: 'Title must be 200 characters or less' });
    }

    if (!description || description.trim().length === 0) {
      errors.push({ field: 'description', message: 'Description is required' });
    } else if (description.length > 1000) {
      errors.push({ field: 'description', message: 'Description must be 1000 characters or less' });
    }

    if (!file) {
      errors.push({ field: 'file', message: 'File is required' });
    }

    if (errors.length > 0) {
      if (file) deleteFile(file.path);
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    // Get student info
    const student = queryOne<Student>(
      'SELECT * FROM students WHERE id = ?',
      [userStudentId]
    );

    if (!student) {
      if (file) deleteFile(file.path);
      throw new AppError('Student not found', 404, ErrorCodes.NOT_FOUND);
    }

    if ((itemId || weekId) && !courseId) {
      if (file) deleteFile(file.path);
      throw new AppError('Lesson submissions require a course', 400, ErrorCodes.VALIDATION_ERROR);
    }
    // Validate the lesson association before accepting a course-linked upload.
    if (courseId) {
      const course = queryOne<{ id: string; sections: string }>('SELECT id, sections FROM courses WHERE id = ?', [courseId]);
      if (!course) {
        if (file) deleteFile(file.path);
        throw new AppError('Course not found', 400, ErrorCodes.VALIDATION_ERROR);
      }
      if (!canAccessCourse(req.user!.userId, courseId, new Set(getUserPermissions(req.user!.userId)), 'enrolled')) {
        if (file) deleteFile(file.path);
        throw new AppError('You are not enrolled in this course', 403, ErrorCodes.FORBIDDEN);
      }
      if (itemId) {
        const item = parseFlatSections(course.sections).flatMap((section) => section.items).find((item) => item.id === itemId);
        const weeks = JSON.parse(course.sections || '[]');
        const weekMatches = !weekId || (Array.isArray(weeks) && weeks.some((week) => week.id === weekId && Array.isArray(week.sections)
          && week.sections.some((section: { items?: { id: string }[] }) => section.items?.some((item) => item.id === itemId))))
          || (weekId === 'week-1' && Array.isArray(weeks) && !weeks.some((week) => Array.isArray(week.sections)));
        if (item?.type !== 'assignment' || !weekMatches) {
          if (file) deleteFile(file.path);
          throw new AppError('Assignment does not belong to this course and week', 400, ErrorCodes.VALIDATION_ERROR);
        }
        const assignment = item as { maxFileSize?: number; allowedMimeTypes?: string[] };
        if ((assignment.maxFileSize && file!.size > assignment.maxFileSize)
          || (assignment.allowedMimeTypes?.length && !assignment.allowedMimeTypes.includes(file!.mimetype))) {
          if (file) deleteFile(file.path);
          throw new AppError('File does not meet the assignment requirements', 400, ErrorCodes.VALIDATION_ERROR);
        }
      }
    }

    // Create submission
    const id = uuidv4();
    execute(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, file_mime_type, course_id, week_id, item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userStudentId,
        title.trim(),
        description.trim(),
        file!.originalname,
        file!.size,
        file!.path,
        file!.mimetype,
        courseId || null,
        weekId || null,
        itemId || null,
      ]
    );

    const submission = queryOne<Submission>('SELECT * FROM submissions WHERE id = ?', [id]);

    if (!submission) {
      if (file) deleteFile(file.path);
      throw new AppError('Failed to create submission', 500, ErrorCodes.INTERNAL_ERROR);
    }

    res.status(201).json({
      success: true,
      data: toSubmissionResponse({ ...submission, student_name: student.name }),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    const userStudentId = studentRecordId(req.user!.userId);

    // Get existing submission
    const existing = queryOne<Submission & { student_name: string }>(
      `SELECT s.*, st.name as student_name
       FROM submissions s
       LEFT JOIN students st ON s.student_id = st.id
       WHERE s.id = ?`,
      [id]
    );

    if (!existing) {
      throw new AppError('Submission not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Check ownership
    if (existing.student_id !== userStudentId) {
      throw new AppError('You do not have permission to update this submission', 403, ErrorCodes.FORBIDDEN);
    }

    // Check if already reviewed
    if (existing.status !== 'pending') {
      throw new AppError('Cannot update a submission that has already been reviewed', 403, ErrorCodes.SUBMISSION_LOCKED);
    }

    // Validation
    const errors: Array<{ field: string; message: string }> = [];

    if (title !== undefined && title.length > 200) {
      errors.push({ field: 'title', message: 'Title must be 200 characters or less' });
    }

    if (description !== undefined && description.length > 1000) {
      errors.push({ field: 'description', message: 'Description must be 1000 characters or less' });
    }

    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    // Build update query
    const updates: string[] = [];
    const params: unknown[] = [];

    if (title !== undefined) {
      updates.push(`title = ?`);
      params.push(title.trim());
    }
    if (description !== undefined) {
      updates.push(`description = ?`);
      params.push(description.trim());
    }

    if (updates.length === 0) {
      res.json({
        success: true,
        data: toSubmissionResponse(existing),
      });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
    params.push(id);

    execute(
      `UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const submission = queryOne<Submission>('SELECT * FROM submissions WHERE id = ?', [id]);

    res.json({
      success: true,
      data: toSubmissionResponse({ ...submission!, student_name: existing.student_name }),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    // Get existing submission
    const existing = queryOne<Submission>(
      'SELECT * FROM submissions WHERE id = ?',
      [id]
    );

    if (!existing) {
      throw new AppError('Submission not found', 404, ErrorCodes.NOT_FOUND);
    }

    const mayDeleteOthers = getUserPermissions(req.user!.userId).some(p => p === 'course.delete' || p === 'course.grade');
    const staffAccess = mayDeleteOthers && canAccessSubmission(req.user!.userId, id, true);
    if (!staffAccess && existing.student_id !== studentRecordId(req.user!.userId)) {
      throw new AppError('You do not have permission to delete this submission', 403, ErrorCodes.FORBIDDEN);
    }
    if (!staffAccess && existing.status !== 'pending') {
      throw new AppError('Cannot delete a submission that has already been reviewed', 403, ErrorCodes.SUBMISSION_LOCKED);
    }

    // Delete file
    deleteFile(existing.file_path);

    // Delete submission
    execute('DELETE FROM submissions WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Submission deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const submission = queryOne<Submission>(
      'SELECT * FROM submissions WHERE id = ?',
      [id]
    );

    if (!submission) {
      throw new AppError('Submission not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (!canAccessSubmission(req.user!.userId, id)) {
      throw new AppError('You do not have permission to download this file', 403, ErrorCodes.FORBIDDEN);
    }

    const safePath = resolveUploadPath(submission.file_path);

    if (!fs.existsSync(safePath)) {
      throw new AppError('File not found', 404, ErrorCodes.NOT_FOUND);
    }

    res.setHeader('Content-Type', submission.file_mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(submission.file_name)}"`);
    res.sendFile(safePath);
  } catch (error) {
    next(error);
  }
}

/**
 * Side effects of an approved grade: complete the linked lesson, queue course_completion when that
 * finishes the course, and queue the grade_approved reward event. Shared by a direct review and a
 * lecturer/admin approving a TA grade. Call inside the transaction that records the approval;
 * the outbox dedup (produceOutboxEvent) keeps a replay from paying twice.
 */
export function applyApprovedGradeEffects(
  submission: { id: string; student_id: string; course_id?: string | null; item_id?: string | null },
  reviewerUserId: string,
  /** The TA who entered the grade, when a lecturer/admin approves a TA grade. */
  graderUserId?: string | null,
): void {
  const studentRecord = queryOne<{ user_id: string | null }>(
    'SELECT user_id FROM students WHERE id = ?',
    [submission.student_id]
  );
  if (!studentRecord?.user_id) return;

  // Phase 4: auto-complete linked course item on approval
  if (submission.course_id && submission.item_id) {
    const course = queryOne<{ sections: string }>(
      'SELECT sections FROM courses WHERE id = ?',
      [submission.course_id]
    );
    if (course?.sections) {
      const sId = findSectionForItem(course.sections, submission.item_id);
      if (sId) {
        execute(
          `INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct)
           VALUES (?, ?, ?, ?, ?, NULL, 100)
           ON CONFLICT (user_id, course_id, item_id) DO UPDATE SET
             completed_at = COALESCE(lesson_completions.completed_at, datetime('now')), progress_pct = 100`,
          [uuidv4(), studentRecord.user_id, submission.course_id, submission.item_id, sId]
        );
        // W04-R1 F2: Check if this approval satisfies the final course requirement.
        // Use student's user_id (not reviewerUserId) — critical identity invariant.
        if (isCourseCompleteForReward(studentRecord.user_id, submission.course_id)) {
          produceOutboxEvent('course_completion', submission.course_id, studentRecord.user_id);
        }
      }
    }
  }

  // R12: produce outbox event for reward eligibility
  produceOutboxEvent('grade_approved', submission.id, studentRecord.user_id, {
    reviewerId: reviewerUserId,
    ...(graderUserId ? { graderId: graderUserId } : {}),
    courseId: submission.course_id,
    itemId: submission.item_id,
  });
}

export async function reviewSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;
    const reviewerUserId = req.user?.userId;

    // Validation
    const errors: Array<{ field: string; message: string }> = [];

    if (!status || !['approved', 'rejected'].includes(status)) {
      errors.push({ field: 'status', message: "Status must be 'approved' or 'rejected'" });
    }

    if (status === 'rejected' && (!feedback || feedback.trim().length === 0)) {
      errors.push({ field: 'feedback', message: 'Feedback is required when rejecting a submission' });
    }

    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    // Get existing submission
    const existing = queryOne<Submission>(
      'SELECT * FROM submissions WHERE id = ?',
      [id]
    );

    if (!existing) {
      throw new AppError('Submission not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (!reviewerUserId || !canAccessSubmission(reviewerUserId, id, true)) {
      throw new AppError('You do not have permission to review this submission', 403, ErrorCodes.FORBIDDEN);
    }

    // Get reviewer user info
    const adminUser = queryOne<User>(
      'SELECT id, name FROM users WHERE id = ?',
      [reviewerUserId]
    );

    // P1.3: Atomic transaction — submission update + auto-complete + outbox event commit together
    const atomicWrite = db.transaction(() => {
      execute(
        `UPDATE submissions
         SET status = ?, feedback = ?, reviewed_at = datetime('now'), reviewed_by_id = ?, updated_at = datetime('now'),
           -- A direct review settles any TA proposal still waiting (UX-002).
           grade_status = CASE WHEN grade_status = 'pending_approval' THEN 'direct' ELSE grade_status END
         WHERE id = ?`,
        [status, feedback?.trim() || null, reviewerUserId, id]
      );

      if (status === 'approved') applyApprovedGradeEffects(existing, reviewerUserId);
    });

    try {
      atomicWrite();
    } catch (err) {
      logger.error({ module: 'review-submission', err, submissionId: id }, 'Atomic submission review + outbox write failed');
      throw new AppError('Failed to review submission', 500, ErrorCodes.INTERNAL_ERROR);
    }

    const submission = queryOne<Submission>('SELECT * FROM submissions WHERE id = ?', [id]);

    // Get student name for response
    const student = queryOne<Student>(
      'SELECT name FROM students WHERE id = ?',
      [submission!.student_id]
    );

    // Process pending outbox events (retryable, outside transaction)
    if (status === 'approved') {
      try {
        processPendingEvents();
      } catch (err) {
        logger.error({ module: 'reward-eligibility', err, submissionId: id }, 'Reward event processing failed');
      }
    }

    // C2: Notify student of submission review (best-effort)
    try {
      const studentRecord = queryOne<{ user_id: string | null }>(
        'SELECT user_id FROM students WHERE id = ?',
        [submission!.student_id]
      );
      if (studentRecord?.user_id) {
        createNotification({
          userId: studentRecord.user_id,
          type: 'submission_reviewed',
          title: `Submission ${status.charAt(0).toUpperCase() + status.slice(1)}`,
          body: `Your submission "${submission!.title}" was ${status}`,
          link: '/student/submissions',
        });
      }
    } catch (err) {
      logger.error({ module: 'notification', err }, 'Submission review emission error');
    }

    res.json({
      success: true,
      data: toSubmissionResponse({
        ...submission!,
        student_name: student?.name,
        reviewer_name: adminUser?.name
      }),
    });
  } catch (error) {
    next(error);
  }
}

/** Phase 1 Course-Centric IA: GET /courses/:courseId/submissions
 *
 * Guarded by requireCourseScope middleware which enforces:
 *   - Admin (course.delete) → bypass
 *   - Instructor (course.manage + assigned) → pass
 *   - TA (course.grade_pending + assigned) → pass
 *   - All others → 403 before reaching this handler
 *
 * Since all callers are authorized staff, show all submissions for the course.
 */
export async function getCourseSubmissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { courseId } = req.params;

    // Verify course exists
    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    const submissions = query<Submission & { student_name: string; reviewer_name: string }>(
      `SELECT s.*, st.name as student_name, u.name as reviewer_name
       FROM submissions s
       LEFT JOIN students st ON s.student_id = st.id
       LEFT JOIN users u ON s.reviewed_by_id = u.id
       WHERE s.course_id = ?
       ORDER BY s.submitted_at DESC`,
      [courseId]
    );

    res.json({
      success: true,
      data: { submissions: submissions.map(s => toSubmissionResponse(s)) },
    });
  } catch (error) {
    next(error);
  }
}
