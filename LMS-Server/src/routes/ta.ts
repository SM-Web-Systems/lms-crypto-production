import { Router, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { query, queryOne, execute } from '../config/database.js';
import { createNotification } from '../services/notificationService.js';
import { getUserPermissions } from '../middleware/rbac.js';
import { canAccessCourse } from '../services/courseAccessService.js';
import { canAccessSubmission } from '../services/submissionAccessService.js';

const router = Router();

// schema.sql's CHECK on grade_status predates 'sent_back' and SQLite cannot widen it
// in place, so a sent-back grade is stored as 'direct' + review_note on a pending
// submission, and reported to clients as 'sent_back'.
const SENT_BACK_SQL = "CASE WHEN s.grade_status = 'direct' AND s.review_note IS NOT NULL AND s.status = 'pending' THEN 'sent_back' ELSE s.grade_status END";

/** AC8: only a lecturer of the course (TA scope excluded) or an admin may decide a TA grade. */
function canDecideTaGrade(userId: string, submissionId: string, courseId: string | null): boolean {
  if (!courseId) return canAccessSubmission(userId, submissionId, true);
  return canAccessCourse(userId, courseId, new Set(getUserPermissions(userId)), 'manage');
}

// GET /ta/courses — list courses where user is assigned TA
router.get('/ta/courses', authenticate, requirePermission('course.grade_pending'), (req, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;

  const courses = query<{ id: string; title: string; course_code: string; assigned_at: string }>(
    `SELECT c.id, c.title, c.course_code, ct.assigned_at
     FROM courses c
     JOIN course_tas ct ON ct.course_id = c.id
     WHERE ct.user_id = ?
     ORDER BY ct.assigned_at DESC`,
    [userId],
  );

  res.json({ success: true, data: { courses } });
});

// GET /ta/courses/:id/submissions — view submissions for assigned course
router.get('/ta/courses/:id/submissions', authenticate, requirePermission('course.grade_pending'), (req, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const { id: courseId } = req.params;

  // Verify TA is assigned to this course
  const assignment = queryOne('SELECT course_id FROM course_tas WHERE course_id = ? AND user_id = ?', [courseId, userId]);
  if (!assignment) {
    res.status(403).json({ success: false, error: 'Not assigned to this course' });
    return;
  }

  const submissions = query<{
    id: string; title: string; student_id: string; student_name: string | null; status: string;
    grade_status: string; submitted_at: string; file_name: string;
    proposed_status: string | null; ta_feedback: string | null; review_note: string | null;
  }>(
    `SELECT s.id, s.title, s.student_id, st.name AS student_name, s.status,
       ${SENT_BACK_SQL} AS grade_status,
       s.submitted_at, s.file_name, s.proposed_status, s.ta_feedback, s.review_note
     FROM submissions s
     LEFT JOIN students st ON st.id = s.student_id
     WHERE s.course_id = ?
     ORDER BY s.submitted_at DESC`,
    [courseId],
  );

  res.json({ success: true, data: { submissions } });
});

// POST /ta/submissions/:id/grade — TA grades submission (pending approval)
router.post('/ta/submissions/:id/grade', authenticate, requirePermission('course.grade_pending'), (req, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const { id: submissionId } = req.params;
  const { status, feedback } = req.body;

  if (!status || !['approved', 'rejected'].includes(status)) {
    res.status(400).json({ success: false, error: "status must be 'approved' or 'rejected'" });
    return;
  }

  const submission = queryOne<{ id: string; course_id: string | null; status: string }>(
    'SELECT id, course_id, status FROM submissions WHERE id = ?', [submissionId]);
  if (!submission) {
    res.status(404).json({ success: false, error: 'Submission not found' });
    return;
  }

  // Verify TA is assigned to this course
  if (submission.course_id) {
    const assignment = queryOne('SELECT course_id FROM course_tas WHERE course_id = ? AND user_id = ?',
      [submission.course_id, userId]);
    if (!assignment) {
      res.status(403).json({ success: false, error: 'Not assigned to this course' });
      return;
    }
  }

  if (submission.status !== 'pending') {
    res.status(400).json({ success: false, error: 'This submission has already been reviewed' });
    return;
  }

  // TA grade: set grade_status to pending_approval, do NOT change main status
  execute(
    "UPDATE submissions SET grade_status = 'pending_approval', graded_by = ?, proposed_status = ?, ta_feedback = ?, updated_at = datetime('now') WHERE id = ?",
    [userId, status, feedback?.trim() || null, submissionId],
  );

  res.json({ success: true, data: { submissionId, gradeStatus: 'pending_approval' } });
});

// POST /ta/submissions/:id/approve-grade — instructor/admin approves TA grade
router.post('/ta/submissions/:id/approve-grade', authenticate, requirePermission('course.grade'), (req, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const { id: submissionId } = req.params;
  const { status } = req.body;

  if (status !== undefined && !['approved', 'rejected'].includes(status)) {
    res.status(400).json({ success: false, error: "status must be 'approved' or 'rejected'" });
    return;
  }

  const submission = queryOne<{
    id: string; status: string; grade_status: string; proposed_status: string | null; course_id: string | null;
    title: string; student_user_id: string | null;
  }>(
    `SELECT s.id, s.status, s.grade_status, s.proposed_status, s.course_id, s.title, st.user_id AS student_user_id
     FROM submissions s LEFT JOIN students st ON st.id = s.student_id WHERE s.id = ?`, [submissionId]);
  if (!submission) {
    res.status(404).json({ success: false, error: 'Submission not found' });
    return;
  }
  if (!canDecideTaGrade(userId, submissionId, submission.course_id)) {
    res.status(403).json({ success: false, error: 'You do not teach this course' });
    return;
  }
  if (submission.grade_status !== 'pending_approval' || submission.status !== 'pending') {
    res.status(400).json({ success: false, error: 'No pending TA grade to approve' });
    return;
  }

  const finalStatus = status || submission.proposed_status || 'approved';

  execute(
    "UPDATE submissions SET grade_status = 'approved', status = ?, reviewed_by_id = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [finalStatus, userId, submissionId],
  );

  // F6: Notify the TA whose grade was approved (best-effort)
  try {
    const sub = queryOne<{ graded_by: string | null; item_id: string | null }>(
      'SELECT graded_by, item_id FROM submissions WHERE id = ?',
      [submissionId],
    );
    if (sub?.graded_by) {
      createNotification({
        userId: sub.graded_by,
        type: 'grade_approved',
        title: 'Grade Approved',
        body: `Your grade for submission ${sub.item_id ?? submissionId} was approved by the instructor.`,
      });
    }
  } catch { /* best-effort */ }

  try {
    if (submission.student_user_id) {
      createNotification({
        userId: submission.student_user_id,
        type: 'submission_reviewed',
        title: `Submission ${finalStatus === 'approved' ? 'Approved' : 'Rejected'}`,
        body: `Your submission "${submission.title}" was ${finalStatus}`,
        link: '/student/submissions',
      });
    }
  } catch { /* best-effort */ }

  res.json({ success: true, data: { submissionId, gradeStatus: 'approved', status: finalStatus } });
});

// POST /ta/submissions/:id/reject-grade — instructor/admin rejects TA grade
router.post('/ta/submissions/:id/reject-grade', authenticate, requirePermission('course.grade'), (req, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const { id: submissionId } = req.params;
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';

  if (!note) {
    res.status(400).json({ success: false, error: 'A note for the TA is required' });
    return;
  }

  const submission = queryOne<{ id: string; status: string; grade_status: string; course_id: string | null }>(
    'SELECT id, status, grade_status, course_id FROM submissions WHERE id = ?', [submissionId]);
  if (!submission) {
    res.status(404).json({ success: false, error: 'Submission not found' });
    return;
  }
  if (!canDecideTaGrade(userId, submissionId, submission.course_id)) {
    res.status(403).json({ success: false, error: 'You do not teach this course' });
    return;
  }
  if (submission.grade_status !== 'pending_approval' || submission.status !== 'pending') {
    res.status(400).json({ success: false, error: 'No pending TA grade to reject' });
    return;
  }

  // Leaves feedback and ta_feedback untouched; see SENT_BACK_SQL for the stored state.
  execute(
    "UPDATE submissions SET grade_status = 'direct', review_note = ?, updated_at = datetime('now') WHERE id = ?",
    [note, submissionId],
  );

  res.json({ success: true, data: { submissionId, gradeStatus: 'sent_back' } });
});

// POST /ta/courses/:id/materials — TA submits material to staging table
router.post('/ta/courses/:id/materials', authenticate, requirePermission('course.grade_pending'), (req, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const { id: courseId } = req.params;
  const { sectionId, itemTitle, itemType, content } = req.body;

  if (!sectionId || !itemTitle || !content) {
    res.status(400).json({ success: false, error: 'sectionId, itemTitle, and content are required' });
    return;
  }

  // Verify TA is assigned
  const assignment = queryOne('SELECT course_id FROM course_tas WHERE course_id = ? AND user_id = ?', [courseId, userId]);
  if (!assignment) {
    res.status(403).json({ success: false, error: 'Not assigned to this course' });
    return;
  }

  const id = uuidv4();
  execute(
    'INSERT INTO course_material_submissions (id, course_id, submitter_id, section_id, item_title, item_type, content) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, courseId, userId, sectionId, itemTitle, itemType || 'text', content],
  );

  res.status(201).json({ success: true, data: { id, courseId, status: 'pending' } });
});

export default router;
