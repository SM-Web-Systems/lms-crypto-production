import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, Course, CourseSection, CourseItem, UserDirectoryItem, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { getDocumentFileUrl } from '../utils/fileUpload.js';

interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  course_code: string;
  sections: string;
}

function getUserCourseCodes(userId: string): string[] {
  const rows = query<{ course_code: string }>(
    'SELECT course_code FROM user_course_codes WHERE user_id = ?',
    [userId]
  );
  return rows.map((r) => r.course_code);
}

function parseSections(sectionsJson: string): CourseSection[] {
  try {
    const parsed = JSON.parse(sectionsJson || '[]') as CourseSection[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ensurePdfFileUrls(sections: CourseSection[]): CourseSection[] {
  return sections.map((sec) => ({
    ...sec,
    items: sec.items.map((item) => {
      if (item.type === 'pdf' && item.documentId && !item.fileUrl) {
        return { ...item, fileUrl: getDocumentFileUrl(item.documentId) };
      }
      return item;
    }),
  }));
}

function rowToCourse(row: CourseRow): Course {
  const sections = ensurePdfFileUrls(parseSections(row.sections));
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    courseCode: row.course_code,
    sections,
  };
}

export async function getCourses(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user?.role === 'admin';
    let rows: CourseRow[];
    if (isAdmin) {
      rows = query<CourseRow>('SELECT id, title, description, course_code, sections FROM courses ORDER BY title');
    } else {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
      }
      const codes = getUserCourseCodes(userId);
      if (codes.length === 0) {
        rows = [];
      } else {
        const placeholders = codes.map(() => '?').join(',');
        rows = query<CourseRow>(
          `SELECT id, title, description, course_code, sections FROM courses WHERE course_code IN (${placeholders}) ORDER BY title`,
          codes
        );
      }
    }
    const courses = rows.map(rowToCourse);
    res.json({
      success: true,
      data: { courses },
      // Duplicate for frontend compatibility: some clients read response.data.courses (e.g. axios)
      courses,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCourse(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const isAdmin = req.user?.role === 'admin';
    const row = queryOne<CourseRow>('SELECT id, title, description, course_code, sections FROM courses WHERE id = ?', [id]);
    if (!row) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }
    if (!isAdmin && userId) {
      const codes = getUserCourseCodes(userId);
      if (!codes.includes(row.course_code)) {
        throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
      }
    }
    res.json({
      success: true,
      data: rowToCourse(row),
    });
  } catch (error) {
    next(error);
  }
}

const COURSE_CODE_REGEX = /^[A-Z0-9]+(-[A-Z0-9]+)*$/i;

function normalizeCourseCode(v: string): string {
  return String(v).trim().toUpperCase();
}

function validateCourseForCreate(body: unknown): { course: Course; errors: Array<{ field: string; message: string }> } {
  const errors: Array<{ field: string; message: string }> = [];
  const o = body as Record<string, unknown>;
  const title = o?.title;
  const sections = o?.sections;
  const courseCodeRaw = o?.courseCode;

  if (title === undefined || title === null || String(title).trim() === '') {
    errors.push({ field: 'title', message: 'Title is required' });
  }
  if (courseCodeRaw === undefined || courseCodeRaw === null || String(courseCodeRaw).trim() === '') {
    errors.push({ field: 'courseCode', message: 'courseCode is required' });
  } else {
    const code = normalizeCourseCode(String(courseCodeRaw));
    if (!COURSE_CODE_REGEX.test(code)) {
      errors.push({ field: 'courseCode', message: 'courseCode must be alphanumeric and hyphens only (e.g. BLOCKCHAIN-101)' });
    }
  }
  if (sections !== undefined && !Array.isArray(sections)) {
    errors.push({ field: 'sections', message: 'sections must be an array' });
  }

  const sectionsArray = Array.isArray(sections) ? (sections as CourseSection[]) : [];
  const courseCode = courseCodeRaw != null ? normalizeCourseCode(String(courseCodeRaw)) : '';
  const course: Course = {
    id: (o?.id ? String(o.id).trim() : '') || uuidv4(),
    title: title != null ? String(title).trim() : '',
    description: o?.description != null ? String(o.description).trim() : undefined,
    courseCode,
    sections: sectionsArray,
  };
  return { course, errors };
}

export async function createCourse(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { course, errors } = validateCourseForCreate(req.body);
    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    const existing = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [course.id]);
    if (existing) {
      throw new AppError('A course with this id already exists', 400, ErrorCodes.DUPLICATE_ENTRY);
    }
    const codeExists = queryOne<{ id: string }>('SELECT id FROM courses WHERE course_code = ?', [course.courseCode]);
    if (codeExists) {
      throw new AppError('A course with this courseCode already exists', 400, ErrorCodes.DUPLICATE_ENTRY);
    }

    execute(
      'INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, ?, ?, ?, ?)',
      [course.id, course.title, course.description ?? null, course.courseCode, JSON.stringify(course.sections)]
    );

    const row = queryOne<CourseRow>('SELECT id, title, description, course_code, sections FROM courses WHERE id = ?', [course.id]);
    if (!row) {
      throw new AppError('Failed to create course', 500, ErrorCodes.INTERNAL_ERROR);
    }

    res.status(201).json({
      success: true,
      data: rowToCourse(row),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCourse(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const existing = queryOne<CourseRow>('SELECT id, title, description, course_code, sections FROM courses WHERE id = ?', [id]);
    if (!existing) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    const o = (req.body || {}) as Record<string, unknown>;
    const errors: Array<{ field: string; message: string }> = [];
    if (o.title !== undefined && (o.title === null || String(o.title).trim() === '')) {
      errors.push({ field: 'title', message: 'Title cannot be empty' });
    }
    if (o.courseCode !== undefined && (o.courseCode === null || String(o.courseCode).trim() === '')) {
      errors.push({ field: 'courseCode', message: 'courseCode cannot be empty' });
    } else if (o.courseCode !== undefined) {
      const code = normalizeCourseCode(String(o.courseCode));
      if (!COURSE_CODE_REGEX.test(code)) {
        errors.push({ field: 'courseCode', message: 'courseCode must be alphanumeric and hyphens only' });
      }
    }
    if (o.sections !== undefined && !Array.isArray(o.sections)) {
      errors.push({ field: 'sections', message: 'sections must be an array' });
    }
    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    const title = o.title !== undefined ? String(o.title).trim() : existing.title;
    const description = o.description !== undefined ? (o.description != null ? String(o.description).trim() : null) : existing.description;
    let courseCode = existing.course_code;
    if (o.courseCode !== undefined) {
      courseCode = normalizeCourseCode(String(o.courseCode));
      const codeExists = queryOne<{ id: string }>('SELECT id FROM courses WHERE course_code = ? AND id != ?', [courseCode, id]);
      if (codeExists) {
        throw new AppError('A course with this courseCode already exists', 400, ErrorCodes.DUPLICATE_ENTRY);
      }
    }
    const sections = o.sections !== undefined ? (o.sections as CourseSection[]) : parseSections(existing.sections);

    execute('UPDATE courses SET title = ?, description = ?, course_code = ?, sections = ? WHERE id = ?', [
      title,
      description ?? null,
      courseCode,
      JSON.stringify(sections),
      id,
    ]);

    const row = queryOne<CourseRow>('SELECT id, title, description, course_code, sections FROM courses WHERE id = ?', [id]);
    res.json({
      success: true,
      data: rowToCourse(row!),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCourse(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const existing = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [id]);
    if (!existing) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }
    execute('DELETE FROM courses WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

// --- Course members (Course members & user directory API) ---

function assertCanAccessCourse(courseId: string, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const course = queryOne<{ course_code: string }>('SELECT course_code FROM courses WHERE id = ?', [courseId]);
  if (!course) return false;
  const hasCode = queryOne<{ user_id: string }>(
    'SELECT user_id FROM user_course_codes WHERE user_id = ? AND course_code = ?',
    [userId, course.course_code]
  );
  return !!hasCode;
}

export async function getCourseMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    const isAdmin = req.user?.role === 'admin';
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id: courseId } = req.params;
    const course = queryOne<{ id: string; course_code: string }>('SELECT id, course_code FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }
    if (!assertCanAccessCourse(courseId, userId, isAdmin)) {
      throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
    }

    const rows = query<{ id: string; name: string; email: string; role: string }>(
      `SELECT u.id, u.name, u.email, u.role
       FROM users u
       INNER JOIN user_course_codes c ON c.user_id = u.id
       WHERE c.course_code = ?
       ORDER BY u.name`,
      [course.course_code]
    );
    const members: UserDirectoryItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as UserDirectoryItem['role'],
    }));

    res.json({
      success: true,
      data: { members },
    });
  } catch (error) {
    next(error);
  }
}

export async function addCourseMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: courseId } = req.params;
    const { userId: rawUserId } = req.body;

    const course = queryOne<{ id: string; course_code: string }>('SELECT id, course_code FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Resolve user: try users table first, then students table (frontend may send student.id)
    let targetUserId = rawUserId;
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

    const existing = queryOne<{ user_id: string }>(
      'SELECT user_id FROM user_course_codes WHERE user_id = ? AND course_code = ?',
      [targetUserId, course.course_code]
    );
    if (existing) {
      res.json({ success: true });
      return;
    }

    execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [targetUserId, course.course_code]);

    const rows = query<{ id: string; name: string; email: string; role: string }>(
      `SELECT u.id, u.name, u.email, u.role
       FROM users u
       INNER JOIN user_course_codes c ON c.user_id = u.id
       WHERE c.course_code = ?
       ORDER BY u.name`,
      [course.course_code]
    );
    const members: UserDirectoryItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as UserDirectoryItem['role'],
    }));

    res.status(201).json({
      success: true,
      data: { members },
    });
  } catch (error) {
    next(error);
  }
}

export async function removeCourseMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: courseId, userId: rawUserId } = req.params;

    const course = queryOne<{ id: string; course_code: string }>('SELECT id, course_code FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Resolve: frontend may send student.id instead of users.id
    let targetUserId = rawUserId;
    if (!queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [targetUserId])) {
      const student = queryOne<{ user_id: string }>('SELECT user_id FROM students WHERE id = ?', [targetUserId]);
      if (student?.user_id) targetUserId = student.user_id;
    }

    const deleted = execute(
      'DELETE FROM user_course_codes WHERE user_id = ? AND course_code = ?',
      [targetUserId, course.course_code]
    );
    if (deleted === 0) {
      throw new AppError('Enrollment not found', 404, ErrorCodes.NOT_FOUND);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}
