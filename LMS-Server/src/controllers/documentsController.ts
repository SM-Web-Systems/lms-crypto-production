import { Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, CourseDocument, CourseDocumentResponse, User, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { deleteFile, getDocumentFileUrl, resolveUploadPath } from '../utils/fileUpload.js';

function parseCourseIds(courseIdsJson: string | null | undefined): string[] {
  if (courseIdsJson == null || courseIdsJson === '') return [];
  try {
    const a = JSON.parse(courseIdsJson);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Multipart JSON string or JSON body array → DB JSON (null = open to all). */
function parseCourseIdsFromBody(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  let arr: string[] = [];
  if (Array.isArray(raw)) {
    arr = raw.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
  } else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) {
        arr = p.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
      }
    } catch {
      return null;
    }
  } else {
    return null;
  }
  return arr.length > 0 ? JSON.stringify(arr) : null;
}

function getUserCourseCodes(userId: string): string[] {
  const rows = query<{ course_code: string }>(
    'SELECT course_code FROM user_course_codes WHERE user_id = ?',
    [userId]
  );
  return rows.map((r) => r.course_code);
}

function userCanAccessDocument(
  docCourseIds: string[],
  userCourseCodes: string[],
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (docCourseIds.length === 0) return true;
  const codesForDocCourses = query<{ course_code: string }>(
    `SELECT course_code FROM courses WHERE id IN (${docCourseIds.map(() => '?').join(',')})`,
    docCourseIds
  );
  const codesSet = new Set(codesForDocCourses.map((r) => r.course_code));
  return userCourseCodes.some((c) => codesSet.has(c));
}

// Default categories
const DEFAULT_CATEGORIES = [
  'Lecture Notes',
  'Assignments',
  'Study Guides',
  'Reference Materials',
  'Exam Preparation',
  'Project Resources',
  'Tutorials',
  'Other',
];

// Helper to convert DB document to API response
function toDocumentResponse(doc: CourseDocument & { uploader_name?: string }): CourseDocumentResponse {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    fileName: doc.file_name,
    fileSize: doc.file_size,
    fileUrl: getDocumentFileUrl(doc.id),
    fileMimeType: doc.file_mime_type,
    courseIds: parseCourseIds(doc.course_ids).length > 0 ? parseCourseIds(doc.course_ids) : undefined,
    uploadedBy: doc.uploader_name || '',
    uploadedById: doc.uploaded_by_id,
    uploadedAt: doc.uploaded_at as unknown as string,
    updatedAt: doc.updated_at as unknown as string,
  };
}

export async function getDocuments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const category = req.query.category as string;
    const search = req.query.search as string;
    const isAdmin = req.user?.role === 'admin';
    const userId = req.user?.userId;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (category) {
      params.push(category);
      conditions.push(`d.category = ?`);
    }
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      conditions.push(`(d.title LIKE ? OR d.description LIKE ?)`);
    }
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    let allDocs = query<CourseDocument & { uploader_name: string }>(
      `SELECT d.*, u.name as uploader_name
       FROM course_documents d
       LEFT JOIN users u ON d.uploaded_by_id = u.id
       ${whereClause}
       ORDER BY d.uploaded_at DESC`,
      params
    );

    if (!isAdmin && userId) {
      const userCodes = getUserCourseCodes(userId);
      allDocs = allDocs.filter((d) => {
        const docCourseIds = parseCourseIds(d.course_ids);
        return userCanAccessDocument(docCourseIds, userCodes, false);
      });
    }

    const total = allDocs.length;
    const offset = (page - 1) * limit;
    const documents = allDocs.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        documents: documents.map(toDocumentResponse),
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

export async function getDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === 'admin';
    const userId = req.user?.userId;

    const document = queryOne<CourseDocument & { uploader_name: string }>(
      `SELECT d.*, u.name as uploader_name
       FROM course_documents d
       LEFT JOIN users u ON d.uploaded_by_id = u.id
       WHERE d.id = ?`,
      [id]
    );

    if (!document) {
      throw new AppError('Document not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (!isAdmin && userId) {
      const docCourseIds = parseCourseIds(document.course_ids);
      const userCodes = getUserCourseCodes(userId);
      if (!userCanAccessDocument(docCourseIds, userCodes, false)) {
        throw new AppError('You do not have access to this document', 403, ErrorCodes.FORBIDDEN);
      }
    }

    res.json({
      success: true,
      data: toDocumentResponse(document),
    });
  } catch (error) {
    next(error);
  }
}

export async function createDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, description, category, courseIds } = req.body;
    const file = req.file;
    const adminUserId = req.user?.userId;
    const courseIdsJson = parseCourseIdsFromBody(courseIds);

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

    if (!category || category.trim().length === 0) {
      errors.push({ field: 'category', message: 'Category is required' });
    }

    if (!file) {
      errors.push({ field: 'file', message: 'File is required' });
    }

    if (errors.length > 0) {
      if (file) deleteFile(file.path);
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    // Get admin user info
    const adminUser = queryOne<User>(
      'SELECT id, name FROM users WHERE id = ?',
      [adminUserId]
    );

    // Create document
    const id = uuidv4();
    execute(
      `INSERT INTO course_documents (id, title, description, category, file_name, file_size, file_path, file_mime_type, course_ids, uploaded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title.trim(),
        description.trim(),
        category.trim(),
        file!.originalname,
        file!.size,
        file!.path,
        file!.mimetype,
        courseIdsJson,
        adminUserId,
      ]
    );

    const document = queryOne<CourseDocument>('SELECT * FROM course_documents WHERE id = ?', [id]);

    if (!document) {
      if (file) deleteFile(file.path);
      throw new AppError('Failed to create document', 500, ErrorCodes.INTERNAL_ERROR);
    }

    res.status(201).json({
      success: true,
      data: toDocumentResponse({ ...document, uploader_name: adminUser?.name }),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { title, description, category, courseIds } = req.body;

    // Get existing document
    const existing = queryOne<CourseDocument & { uploader_name: string }>(
      `SELECT d.*, u.name as uploader_name
       FROM course_documents d
       LEFT JOIN users u ON d.uploaded_by_id = u.id
       WHERE d.id = ?`,
      [id]
    );

    if (!existing) {
      throw new AppError('Document not found', 404, ErrorCodes.NOT_FOUND);
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
    if (category !== undefined) {
      updates.push(`category = ?`);
      params.push(category.trim());
    }
    if (courseIds !== undefined) {
      updates.push(`course_ids = ?`);
      params.push(Array.isArray(courseIds) ? JSON.stringify(courseIds) : null);
    }

    if (updates.length === 0) {
      res.json({
        success: true,
        data: toDocumentResponse(existing),
      });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
    params.push(id);

    execute(
      `UPDATE course_documents SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const document = queryOne<CourseDocument & { uploader_name: string }>(
      `SELECT d.*, u.name as uploader_name
       FROM course_documents d
       LEFT JOIN users u ON d.uploaded_by_id = u.id
       WHERE d.id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: toDocumentResponse(document!),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    // Get existing document
    const existing = queryOne<CourseDocument>(
      'SELECT * FROM course_documents WHERE id = ?',
      [id]
    );

    if (!existing) {
      throw new AppError('Document not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Delete file
    deleteFile(existing.file_path);

    // Delete document
    execute('DELETE FROM course_documents WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === 'admin';
    const userId = req.user?.userId;

    const document = queryOne<CourseDocument>(
      'SELECT * FROM course_documents WHERE id = ?',
      [id]
    );

    if (!document) {
      throw new AppError('Document not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (!isAdmin && userId) {
      const docCourseIds = parseCourseIds(document.course_ids);
      const userCodes = getUserCourseCodes(userId);
      if (!userCanAccessDocument(docCourseIds, userCodes, false)) {
        throw new AppError('You do not have access to this document', 403, ErrorCodes.FORBIDDEN);
      }
    }

    const safePath = resolveUploadPath(document.file_path);

    if (!fs.existsSync(safePath)) {
      throw new AppError('File not found', 404, ErrorCodes.NOT_FOUND);
    }

    res.setHeader('Content-Type', document.file_mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
    res.setHeader('Content-Length', document.file_size);
    res.sendFile(safePath);
  } catch (error) {
    next(error);
  }
}

export async function getCategories(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get unique categories from database
    const dbCategories = query<{ category: string }>(
      'SELECT DISTINCT category FROM course_documents ORDER BY category'
    );

    // Merge with default categories
    const categorySet = new Set(DEFAULT_CATEGORIES);
    for (const row of dbCategories) {
      categorySet.add(row.category);
    }

    // Sort alphabetically
    const categories = Array.from(categorySet).sort();

    res.json({
      success: true,
      data: {
        categories,
      },
    });
  } catch (error) {
    next(error);
  }
}

