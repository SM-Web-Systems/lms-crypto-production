import { Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, Submission, SubmissionResponse, Student, User, ErrorCodes, SubmissionStatus } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { deleteFile, getFileUrl, resolveUploadPath } from '../utils/fileUpload.js';

// Helper to convert DB submission to API response
function toSubmissionResponse(submission: Submission & { student_name?: string; reviewer_name?: string }): SubmissionResponse {
  return {
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
    feedback: submission.feedback,
    createdAt: submission.created_at as unknown as string,
    updatedAt: submission.updated_at as unknown as string,
  };
}

export async function getSubmissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as SubmissionStatus;
    const studentId = req.query.studentId as string;

    const isAdmin = req.user?.role === 'admin';
    let userStudentId = req.user?.studentId;

    // Resolve studentId from DB if missing in JWT (e.g. token from before student record existed)
    if (!isAdmin && !userStudentId && req.user?.role === 'student' && req.user?.userId) {
      const student = queryOne<Student>('SELECT id FROM students WHERE user_id = ?', [req.user.userId]);
      userStudentId = student?.id;
    }

    // Build query with filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Students can only see their own submissions. If no student profile is linked yet, return empty list.
    if (!isAdmin) {
      if (!userStudentId) {
        res.json({
          success: true,
          data: {
            submissions: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          },
        });
        return;
      }
      params.push(userStudentId);
      conditions.push(`s.student_id = ?`);
    } else if (studentId) {
      // Admin can filter by student
      params.push(studentId);
      conditions.push(`s.student_id = ?`);
    }

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      params.push(status);
      conditions.push(`s.status = ?`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total count
    const countResult = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM submissions s ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // Get submissions with student name
    const submissions = query<Submission & { student_name: string; reviewer_name: string }>(
      `SELECT s.*, st.name as student_name, u.name as reviewer_name
       FROM submissions s
       LEFT JOIN students st ON s.student_id = st.id
       LEFT JOIN users u ON s.reviewed_by_id = u.id
       ${whereClause}
       ORDER BY s.submitted_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: {
        submissions: submissions.map(toSubmissionResponse),
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
    const isAdmin = req.user?.role === 'admin';
    const userStudentId = req.user?.studentId;

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

    // Students can only view their own submissions
    if (!isAdmin && submission.student_id !== userStudentId) {
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
    const { title, description } = req.body;
    const file = req.file;
    let userStudentId = req.user?.studentId;

    // If JWT has no studentId (e.g. token from before student record existed), resolve from DB for students
    if (!userStudentId && req.user?.role === 'student' && req.user?.userId) {
      const student = queryOne<Student>('SELECT id FROM students WHERE user_id = ?', [req.user.userId]);
      userStudentId = student?.id;
    }

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

    // Create submission
    const id = uuidv4();
    execute(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, file_mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userStudentId,
        title.trim(),
        description.trim(),
        file!.originalname,
        file!.size,
        file!.path,
        file!.mimetype,
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
    const userStudentId = req.user?.studentId;

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
    const isAdmin = req.user?.role === 'admin';
    const userStudentId = req.user?.studentId;

    // Get existing submission
    const existing = queryOne<Submission>(
      'SELECT * FROM submissions WHERE id = ?',
      [id]
    );

    if (!existing) {
      throw new AppError('Submission not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Check permissions
    if (!isAdmin) {
      if (existing.student_id !== userStudentId) {
        throw new AppError('You do not have permission to delete this submission', 403, ErrorCodes.FORBIDDEN);
      }
      // Students can only delete pending submissions
      if (existing.status !== 'pending') {
        throw new AppError('Cannot delete a submission that has already been reviewed', 403, ErrorCodes.SUBMISSION_LOCKED);
      }
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
    const isAdmin = req.user?.role === 'admin';
    const userStudentId = req.user?.studentId;

    const submission = queryOne<Submission>(
      'SELECT * FROM submissions WHERE id = ?',
      [id]
    );

    if (!submission) {
      throw new AppError('Submission not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Check permissions
    if (!isAdmin && submission.student_id !== userStudentId) {
      throw new AppError('You do not have permission to download this file', 403, ErrorCodes.FORBIDDEN);
    }

    const safePath = resolveUploadPath(submission.file_path);

    if (!fs.existsSync(safePath)) {
      throw new AppError('File not found', 404, ErrorCodes.NOT_FOUND);
    }

    res.setHeader('Content-Type', submission.file_mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${submission.file_name}"`);
    res.sendFile(safePath);
  } catch (error) {
    next(error);
  }
}

export async function reviewSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;
    const adminUserId = req.user?.userId;

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

    // Get admin user info
    const adminUser = queryOne<User>(
      'SELECT id, name FROM users WHERE id = ?',
      [adminUserId]
    );

    // Update submission
    execute(
      `UPDATE submissions 
       SET status = ?, feedback = ?, reviewed_at = datetime('now'), reviewed_by_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [status, feedback?.trim() || null, adminUserId, id]
    );

    const submission = queryOne<Submission>('SELECT * FROM submissions WHERE id = ?', [id]);

    // Get student name for response
    const student = queryOne<Student>(
      'SELECT name FROM students WHERE id = ?',
      [submission!.student_id]
    );

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
