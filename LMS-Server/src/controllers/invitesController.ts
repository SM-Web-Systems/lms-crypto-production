import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendEnrollmentEmail, sendCourseInviteEmail } from '../services/emailService.js';

interface CourseRow { id: string; title: string; course_code: string | null }
interface UserRow { id: string; name: string; email: string }
interface InviteRow {
  id: string;
  course_id: string;
  email: string;
  token: string;
  status: string;
  created_at: string;
  expires_at: string | null;
}

/** GET /courses/:courseId/invites — list pending invites for a course */
export async function getInvites(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { courseId } = req.params;
    const rows = query<InviteRow>(
      `SELECT id, course_id, email, token, status, created_at, expires_at
       FROM course_invites WHERE course_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
      [courseId]
    );
    res.json({ success: true, data: { invites: rows } });
  } catch (error) {
    next(error);
  }
}

/** DELETE /courses/:courseId/invites/:inviteId — revoke a pending invite */
export async function revokeInvite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { inviteId } = req.params;
    execute(`UPDATE course_invites SET status = 'revoked' WHERE id = ?`, [inviteId]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /courses/:courseId/invite
 * Body: { emails: string[] }
 *
 * For each email:
 *   - Existing user → enroll immediately, send enrollment email
 *   - New email → create pending invite, send signup invite email
 */
export async function bulkInvite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);

    const { courseId } = req.params;
    const course = queryOne<CourseRow>(
      'SELECT id, title, course_code FROM courses WHERE id = ?',
      [courseId]
    );
    if (!course) throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);

    const rawEmails: unknown = req.body.emails;
    if (!Array.isArray(rawEmails) || rawEmails.length === 0) {
      throw new AppError('emails must be a non-empty array', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const emails: string[] = rawEmails
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => e.includes('@'));

    if (emails.length === 0) {
      throw new AppError('No valid email addresses provided', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const enrolled: string[] = [];
    const invited: string[] = [];
    const alreadyEnrolled: string[] = [];
    const errors: string[] = [];

    for (const email of emails) {
      try {
        const user = queryOne<UserRow>('SELECT id, name, email FROM users WHERE LOWER(email) = ?', [email]);

        if (user) {
          // Check if already enrolled via course_code
          const existingCode = course.course_code
            ? queryOne<{ user_id: string }>(
                'SELECT user_id FROM user_course_codes WHERE user_id = ? AND course_code = ?',
                [user.id, course.course_code]
              )
            : null;

          if (existingCode) {
            alreadyEnrolled.push(email);
          } else {
            // Enroll: add course_code access
            if (course.course_code) {
              execute(
                'INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)',
                [user.id, course.course_code]
              );
            }
            enrolled.push(email);
            // Fire-and-forget email
            sendEnrollmentEmail({ to: email, name: user.name, courseName: course.title }).catch(
              (err) => console.error('[invitesController] enrollment email failed:', err)
            );
          }
        } else {
          // Check if invite already pending
          const existing = queryOne<{ id: string }>(
            `SELECT id FROM course_invites WHERE course_id = ? AND LOWER(email) = ? AND status = 'pending'`,
            [courseId, email]
          );
          if (existing) {
            alreadyEnrolled.push(email); // treat duplicate invite as "already handled"
          } else {
            const token = uuidv4();
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            execute(
              `INSERT INTO course_invites (id, course_id, email, token, expires_at) VALUES (?, ?, ?, ?, ?)`,
              [uuidv4(), courseId, email, token, expiresAt]
            );
            invited.push(email);
            sendCourseInviteEmail({ to: email, courseName: course.title, inviteToken: token }).catch(
              (err) => console.error('[invitesController] invite email failed:', err)
            );
          }
        }
      } catch (err) {
        errors.push(email);
        console.error(`[invitesController] error processing ${email}:`, err);
      }
    }

    res.json({
      success: true,
      data: { enrolled, invited, alreadyEnrolled, errors },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /invites/accept?token=TOKEN
 * Called when a new user signs up using an invite link.
 * Returns the invite metadata so the frontend can auto-enroll after signup.
 */
export async function getInviteByToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.query as { token?: string };
    if (!token) throw new AppError('Token required', 400, ErrorCodes.VALIDATION_ERROR);

    const invite = queryOne<InviteRow & { course_title: string }>(
      `SELECT i.*, c.title AS course_title
       FROM course_invites i JOIN courses c ON i.course_id = c.id
       WHERE i.token = ? AND i.status = 'pending'`,
      [token]
    );
    if (!invite) throw new AppError('Invite not found or already used', 404, ErrorCodes.NOT_FOUND);

    res.json({
      success: true,
      data: {
        email: invite.email,
        courseId: invite.course_id,
        courseName: invite.course_title,
        expiresAt: invite.expires_at,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /invites/accept
 * Body: { token: string }
 * Called after a user signs up — marks invite accepted and enrolls them.
 */
export async function acceptInvite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);

    const { token } = req.body as { token?: string };
    if (!token) throw new AppError('Token required', 400, ErrorCodes.VALIDATION_ERROR);

    const invite = queryOne<InviteRow>(
      `SELECT * FROM course_invites WHERE token = ? AND status = 'pending'`,
      [token]
    );
    if (!invite) throw new AppError('Invite not found or already used', 404, ErrorCodes.NOT_FOUND);

    const course = queryOne<CourseRow>('SELECT id, title, course_code FROM courses WHERE id = ?', [invite.course_id]);
    if (!course) throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);

    // Enroll
    if (course.course_code) {
      execute(
        'INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)',
        [userId, course.course_code]
      );
    }
    execute(`UPDATE course_invites SET status = 'accepted' WHERE id = ?`, [invite.id]);

    res.json({ success: true, data: { courseId: course.id, courseName: course.title } });
  } catch (error) {
    next(error);
  }
}
