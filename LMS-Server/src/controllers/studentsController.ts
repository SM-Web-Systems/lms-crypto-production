import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, Student, StudentResponse, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

// Helper to convert DB student to API response
function toStudentResponse(student: Student): StudentResponse {
  return {
    id: student.id,
    userId: student.user_id,
    name: student.name,
    email: student.email,
    enrollmentNumber: student.enrollment_number,
    department: student.department,
    semester: student.semester,
    createdAt: student.created_at as unknown as string,
    updatedAt: student.updated_at as unknown as string,
  };
}

export async function getStudents(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const department = req.query.department as string;
    const semester = req.query.semester as string;

    // Build query with filters
    let whereClause = '';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (search) {
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      conditions.push(`(name LIKE ? OR email LIKE ? OR enrollment_number LIKE ?)`);
    }

    if (department) {
      params.push(department);
      conditions.push(`department = ?`);
    }

    if (semester) {
      params.push(parseInt(semester));
      conditions.push(`semester = ?`);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Get total count
    const countResult = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM students ${whereClause}`,
      params
    );
    const total = countResult?.count || 0;

    // Get students with pagination
    const students = query<Student>(
      `SELECT * FROM students ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: {
        students: students.map(toStudentResponse),
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

export async function getStudent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    const student = queryOne<Student>(
      'SELECT * FROM students WHERE id = ?',
      [id]
    );

    if (!student) {
      throw new AppError('Student not found', 404, ErrorCodes.NOT_FOUND);
    }

    res.json({
      success: true,
      data: toStudentResponse(student),
    });
  } catch (error) {
    next(error);
  }
}

export async function createStudent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, enrollmentNumber, department, semester } = req.body;

    // Validation
    const errors: Array<{ field: string; message: string }> = [];
    
    if (!name || name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Name is required' });
    }
    if (!email || !email.includes('@')) {
      errors.push({ field: 'email', message: 'Valid email is required' });
    }
    if (!enrollmentNumber || enrollmentNumber.trim().length === 0) {
      errors.push({ field: 'enrollmentNumber', message: 'Enrollment number is required' });
    }
    if (!department || department.trim().length === 0) {
      errors.push({ field: 'department', message: 'Department is required' });
    }
    if (!semester || semester < 1 || semester > 8) {
      errors.push({ field: 'semester', message: 'Semester must be between 1 and 8' });
    }

    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    // Check for duplicates
    const existingEmail = queryOne<Student>(
      'SELECT id FROM students WHERE email = ?',
      [email.toLowerCase()]
    );
    if (existingEmail) {
      errors.push({ field: 'email', message: 'Email already exists' });
    }

    const existingEnrollment = queryOne<Student>(
      'SELECT id FROM students WHERE enrollment_number = ?',
      [enrollmentNumber]
    );
    if (existingEnrollment) {
      errors.push({ field: 'enrollmentNumber', message: 'Enrollment number already exists' });
    }

    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.DUPLICATE_ENTRY, errors);
    }

    // Create student — also link user_id if a users row with that email already exists
    const id = uuidv4();
    const existingUser = queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    execute(
      `INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, existingUser?.id ?? null, name.trim(), email.toLowerCase(), enrollmentNumber.trim(), department.trim(), semester]
    );

    const student = queryOne<Student>('SELECT * FROM students WHERE id = ?', [id]);

    if (!student) {
      throw new AppError('Failed to create student', 500, ErrorCodes.INTERNAL_ERROR);
    }

    res.status(201).json({
      success: true,
      data: toStudentResponse(student),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStudent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { name, email, enrollmentNumber, department, semester } = req.body;

    // Check if student exists
    const existing = queryOne<Student>(
      'SELECT * FROM students WHERE id = ?',
      [id]
    );

    if (!existing) {
      throw new AppError('Student not found', 404, ErrorCodes.NOT_FOUND);
    }

    const errors: Array<{ field: string; message: string }> = [];

    // Check for duplicate email if changing
    if (email && email.toLowerCase() !== existing.email) {
      const existingEmail = queryOne<Student>(
        'SELECT id FROM students WHERE email = ? AND id != ?',
        [email.toLowerCase(), id]
      );
      if (existingEmail) {
        errors.push({ field: 'email', message: 'Email already exists' });
      }
    }

    // Check for duplicate enrollment number if changing
    if (enrollmentNumber && enrollmentNumber !== existing.enrollment_number) {
      const existingEnrollment = queryOne<Student>(
        'SELECT id FROM students WHERE enrollment_number = ? AND id != ?',
        [enrollmentNumber, id]
      );
      if (existingEnrollment) {
        errors.push({ field: 'enrollmentNumber', message: 'Enrollment number already exists' });
      }
    }

    // Validate semester if provided
    if (semester !== undefined && (semester < 1 || semester > 8)) {
      errors.push({ field: 'semester', message: 'Semester must be between 1 and 8' });
    }

    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    // Build update query
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      updates.push(`name = ?`);
      params.push(name.trim());
    }
    if (email !== undefined) {
      updates.push(`email = ?`);
      params.push(email.toLowerCase());
    }
    if (enrollmentNumber !== undefined) {
      updates.push(`enrollment_number = ?`);
      params.push(enrollmentNumber.trim());
    }
    if (department !== undefined) {
      updates.push(`department = ?`);
      params.push(department.trim());
    }
    if (semester !== undefined) {
      updates.push(`semester = ?`);
      params.push(semester);
    }

    if (updates.length === 0) {
      res.json({
        success: true,
        data: toStudentResponse(existing),
      });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
    params.push(id);

    execute(
      `UPDATE students SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const student = queryOne<Student>('SELECT * FROM students WHERE id = ?', [id]);

    res.json({
      success: true,
      data: toStudentResponse(student!),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /students/import
 * Body: { students: Array<{ name, email, enrollmentNumber, department, semester }> }
 * Returns per-row results so the UI can show partial success.
 */
export async function importStudents(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows: Array<{ name: string; email: string; enrollmentNumber: string; department: string; semester: number }> = req.body.students;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new AppError('No student rows provided', 400, ErrorCodes.VALIDATION_ERROR);
    }
    if (rows.length > 500) {
      throw new AppError('Maximum 500 rows per import', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const results: Array<{ row: number; status: 'created' | 'skipped'; name: string; email: string; reason?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const { name, email, enrollmentNumber, department, semester } = rows[i];
      const rowNum = i + 1;

      // Basic validation
      if (!name?.trim() || !email?.includes('@') || !enrollmentNumber?.trim() || !department?.trim() || !semester) {
        results.push({ row: rowNum, status: 'skipped', name: name ?? '', email: email ?? '', reason: 'Missing or invalid field(s)' });
        continue;
      }
      if (semester < 1 || semester > 8) {
        results.push({ row: rowNum, status: 'skipped', name, email, reason: 'Semester must be 1–8' });
        continue;
      }

      const emailLower = email.toLowerCase().trim();
      if (queryOne<Student>('SELECT id FROM students WHERE email = ?', [emailLower])) {
        results.push({ row: rowNum, status: 'skipped', name, email, reason: 'Email already exists' });
        continue;
      }
      if (queryOne<Student>('SELECT id FROM students WHERE enrollment_number = ?', [enrollmentNumber.trim()])) {
        results.push({ row: rowNum, status: 'skipped', name, email, reason: 'Enrollment number already exists' });
        continue;
      }

      const id = uuidv4();
      const existingUser = queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [emailLower]);
      execute(
        `INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, existingUser?.id ?? null, name.trim(), emailLower, enrollmentNumber.trim(), department.trim(), Number(semester)]
      );
      results.push({ row: rowNum, status: 'created', name, email });
    }

    const created = results.filter((r) => r.status === 'created').length;
    res.status(207).json({
      success: true,
      data: { created, skipped: results.length - created, results },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteStudent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    // Check if student exists
    const existing = queryOne<Student>(
      'SELECT id FROM students WHERE id = ?',
      [id]
    );

    if (!existing) {
      throw new AppError('Student not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Delete student (cascades to submissions due to foreign key)
    execute('DELETE FROM students WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Student and associated submissions deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}
