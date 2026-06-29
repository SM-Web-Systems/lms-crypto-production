import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  scope: 'general' | 'course';
  course_id: string | null;
  author_id: string;
  author_name: string;
  course_title: string | null;
  course_code: string | null;
  pinned: number;
  created_at: string;
  updated_at: string;
}

function rowToAnnouncement(r: AnnouncementRow) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    scope: r.scope,
    courseId: r.course_id,
    courseTitle: r.course_title,
    courseCode: r.course_code,
    authorId: r.author_id,
    authorName: r.author_name,
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT a.id, a.title, a.body, a.scope, a.course_id, a.author_id,
         a.pinned, a.created_at, a.updated_at,
         u.name  AS author_name,
         c.title AS course_title,
         c.course_code
  FROM announcements a
  JOIN users u ON a.author_id = u.id
  LEFT JOIN courses c ON a.course_id = c.id
`;

/**
 * GET /announcements
 * - Admins: all announcements (general + all courses)
 * - Students: general announcements + those for courses the student has access to
 *   Filter: ?scope=general|course   ?courseId=<id>
 */
export async function getAnnouncements(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    const role   = req.user?.role;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);

    let rows: AnnouncementRow[];

    if (role === 'admin') {
      rows = query<AnnouncementRow>(
        `${SELECT} ORDER BY a.pinned DESC, a.created_at DESC`
      );
    } else {
      // student: general + courses they are enrolled in (via user_course_codes)
      rows = query<AnnouncementRow>(
        `${SELECT}
         WHERE a.scope = 'general'
            OR (
              a.scope = 'course'
              AND a.course_id IN (
                SELECT c2.id FROM courses c2
                JOIN user_course_codes ucc ON ucc.course_code = c2.course_code
                WHERE ucc.user_id = ?
              )
            )
         ORDER BY a.pinned DESC, a.created_at DESC`,
        [userId]
      );
    }

    res.json({ success: true, data: { announcements: rows.map(rowToAnnouncement) } });
  } catch (error) { next(error); }
}

/** POST /announcements — admin only */
export async function createAnnouncement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);

    const { title, body, scope, courseId, pinned } = req.body ?? {};

    if (!title || !String(title).trim()) throw new AppError('Title is required', 400, ErrorCodes.VALIDATION_ERROR);
    if (!body  || !String(body).trim())  throw new AppError('Body is required',  400, ErrorCodes.VALIDATION_ERROR);

    const resolvedScope: 'general' | 'course' = scope === 'course' ? 'course' : 'general';
    let resolvedCourseId: string | null = null;

    if (resolvedScope === 'course') {
      if (!courseId) throw new AppError('courseId is required for course announcements', 400, ErrorCodes.VALIDATION_ERROR);
      const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
      if (!course) throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
      resolvedCourseId = courseId;
    }

    const id = uuidv4();
    execute(
      `INSERT INTO announcements (id, title, body, scope, course_id, author_id, pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, String(title).trim(), String(body).trim(), resolvedScope, resolvedCourseId, userId, pinned ? 1 : 0]
    );

    const row = queryOne<AnnouncementRow>(`${SELECT} WHERE a.id = ?`, [id]);
    if (!row) throw new AppError('Failed to create announcement', 500, ErrorCodes.INTERNAL_ERROR);

    res.status(201).json({ success: true, data: rowToAnnouncement(row) });
  } catch (error) { next(error); }
}

/** PATCH /announcements/:id — admin only */
export async function updateAnnouncement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const existing = queryOne<{ id: string }>('SELECT id FROM announcements WHERE id = ?', [id]);
    if (!existing) throw new AppError('Announcement not found', 404, ErrorCodes.NOT_FOUND);

    const { title, body, scope, courseId, pinned } = req.body ?? {};
    const updates: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(String(title).trim()); }
    if (body  !== undefined) { updates.push('body = ?');  params.push(String(body).trim()); }
    if (pinned !== undefined) { updates.push('pinned = ?'); params.push(pinned ? 1 : 0); }

    if (scope !== undefined) {
      const s: 'general' | 'course' = scope === 'course' ? 'course' : 'general';
      updates.push('scope = ?');
      params.push(s);
      if (s === 'course') {
        if (!courseId) throw new AppError('courseId required', 400, ErrorCodes.VALIDATION_ERROR);
        updates.push('course_id = ?');
        params.push(courseId);
      } else {
        updates.push('course_id = NULL');
      }
    }

    params.push(id);
    execute(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`, params);

    const row = queryOne<AnnouncementRow>(`${SELECT} WHERE a.id = ?`, [id]);
    res.json({ success: true, data: rowToAnnouncement(row!) });
  } catch (error) { next(error); }
}

/** DELETE /announcements/:id — admin only */
export async function deleteAnnouncement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    execute('DELETE FROM announcements WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) { next(error); }
}
