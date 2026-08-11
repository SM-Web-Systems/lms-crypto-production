import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, Course, CourseSection, CourseItem, UserDirectoryItem, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { getDocumentFileUrl, deleteFile } from '../utils/fileUpload.js';
import { createNotification } from '../services/notificationService.js';
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';
import { parseGitHubUrl, isAllowedOrg, fetchGitHubZip } from '../services/githubImportService.js';

interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  course_code: string;
  sections: string;
  sponsor_label: string | null;
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
    ...(row.sponsor_label ? { sponsorLabel: row.sponsor_label } : {}),
  };
}

export async function getCourses(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user?.role;
    const userId = req.user?.userId;
    let rows: CourseRow[];
    if (role === 'admin') {
      // Check if user has tenant.manage (super-admin) — sees all courses
      const hasTenantManage = queryOne<{ name: string }>(
        `SELECT p.name FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ? AND p.name = 'tenant.manage'`,
        [userId]
      );
      if (hasTenantManage) {
        rows = query<CourseRow>('SELECT id, title, description, course_code, sections, sponsor_label FROM courses ORDER BY title');
      } else {
        // Tenant admin: see own tenant courses + platform-wide courses
        rows = query<CourseRow>(
          `SELECT id, title, description, course_code, sections, sponsor_label FROM courses
           WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = ? AND tenant_role = 'admin')
              OR tenant_id IS NULL
           ORDER BY title`,
          [userId]
        );
      }
    } else if (role === 'lecturer' && userId) {
      // Lecturers see courses they are assigned to via course_lecturers
      rows = query<CourseRow>(
        `SELECT c.id, c.title, c.description, c.course_code, c.sections, c.sponsor_label
         FROM courses c
         INNER JOIN course_lecturers cl ON cl.course_id = c.id
         WHERE cl.user_id = ?
         ORDER BY c.title`,
        [userId]
      );
    } else {
      if (!userId) {
        throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
      }
      const codes = getUserCourseCodes(userId);
      if (codes.length === 0) {
        rows = [];
      } else {
        const placeholders = codes.map(() => '?').join(',');
        rows = query<CourseRow>(
          `SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE course_code IN (${placeholders}) ORDER BY title`,
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
    const row = queryOne<CourseRow>('SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?', [id]);
    if (!row) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }
    if (req.user?.role !== 'admin' && userId) {
      if (req.user?.role === 'lecturer') {
        const assigned = queryOne<{ course_id: string }>(
          'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
          [id, userId]
        );
        if (!assigned) {
          throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
        }
      } else {
        const codes = getUserCourseCodes(userId);
        if (!codes.includes(row.course_code)) {
          throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
        }
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

    const sponsorLabel = (req.body as Record<string, unknown>)?.sponsorLabel;
    const sponsorLabelVal = sponsorLabel != null && String(sponsorLabel).trim() !== '' ? String(sponsorLabel).trim() : null;

    // Determine tenant_id: auto-set for tenant admins, explicit for super-admins, NULL otherwise
    let tenantId: string | null = null;
    if (req.user?.role === 'admin' && req.user?.userId) {
      const hasTenantManage = queryOne<{ name: string }>(
        `SELECT p.name FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ? AND p.name = 'tenant.manage'`,
        [req.user.userId]
      );
      if (!hasTenantManage) {
        // Tenant admin: auto-set to their tenant
        const tenantAdmin = queryOne<{ tenant_id: string }>(
          `SELECT tenant_id FROM tenant_users WHERE user_id = ? AND tenant_role = 'admin' LIMIT 1`,
          [req.user.userId]
        );
        if (tenantAdmin) {
          tenantId = tenantAdmin.tenant_id;
        }
      }
    }

    execute(
      'INSERT INTO courses (id, title, description, course_code, sections, sponsor_label, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [course.id, course.title, course.description ?? null, course.courseCode, JSON.stringify(course.sections), sponsorLabelVal, tenantId]
    );

    const row = queryOne<CourseRow>('SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?', [course.id]);
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
    const existing = queryOne<CourseRow>('SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?', [id]);
    if (!existing) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Lecturers may only update courses they are assigned to via course_lecturers
    if (req.user?.role === 'lecturer') {
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [id, req.user.userId]
      );
      if (!assigned) {
        throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
      }
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
    const sponsorLabel = o.sponsorLabel !== undefined
      ? (o.sponsorLabel != null && String(o.sponsorLabel).trim() !== '' ? String(o.sponsorLabel).trim() : null)
      : existing.sponsor_label;

    execute('UPDATE courses SET title = ?, description = ?, course_code = ?, sections = ?, sponsor_label = ? WHERE id = ?', [
      title,
      description ?? null,
      courseCode,
      JSON.stringify(sections),
      sponsorLabel,
      id,
    ]);

    const row = queryOne<CourseRow>('SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?', [id]);
    res.json({
      success: true,
      data: rowToCourse(row!),
    });
  } catch (error) {
    next(error);
  }
}

const VALID_ITEM_TYPES = ['video', 'link', 'pdf', 'text', 'audio', 'quiz', 'assignment', 'download'] as const;
const URL_REQUIRED_TYPES = ['video', 'link', 'audio'];

export async function importCourseContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const existing = queryOne<CourseRow>(
      'SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?',
      [id],
    );
    if (!existing) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Lecturer assignment guard (same as updateCourse)
    if (req.user?.role === 'lecturer') {
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [id, req.user.userId],
      );
      if (!assigned) {
        throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
      }
    }

    const body = req.body as { sections?: unknown; mode?: string };
    const mode = body.mode === 'replace' ? 'replace' : 'append';

    if (!body.sections || !Array.isArray(body.sections) || body.sections.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'sections must be a non-empty array' },
      });
      return;
    }

    const errors: Array<{ section: number; item?: number; field: string; message: string }> = [];
    const importedSections: CourseSection[] = [];
    let totalItems = 0;

    for (let si = 0; si < body.sections.length; si++) {
      const sec = body.sections[si] as Record<string, unknown>;
      const secTitle = typeof sec.title === 'string' ? sec.title.trim() : '';
      if (!secTitle) {
        errors.push({ section: si, field: 'title', message: 'Section title is required' });
        continue;
      }

      const items: CourseItem[] = [];
      const rawItems = Array.isArray(sec.items) ? sec.items : [];

      for (let ii = 0; ii < rawItems.length; ii++) {
        const raw = rawItems[ii] as Record<string, unknown>;
        const itemType = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
        const itemTitle = typeof raw.title === 'string' ? raw.title.trim() : '';

        if (!VALID_ITEM_TYPES.includes(itemType as typeof VALID_ITEM_TYPES[number])) {
          errors.push({ section: si, item: ii, field: 'type', message: `Invalid type "${itemType}"` });
          continue;
        }
        if (!itemTitle) {
          errors.push({ section: si, item: ii, field: 'title', message: 'Item title is required' });
          continue;
        }

        if (URL_REQUIRED_TYPES.includes(itemType)) {
          const url = typeof raw.url === 'string' ? raw.url.trim() : '';
          if (!url) {
            errors.push({ section: si, item: ii, field: 'url', message: `url is required for ${itemType} items` });
            continue;
          }
        }
        if (itemType === 'quiz') {
          const quizId = typeof raw.quizId === 'string' ? raw.quizId.trim() : '';
          if (!quizId) {
            errors.push({ section: si, item: ii, field: 'quizId', message: 'quizId is required for quiz items' });
            continue;
          }
        }
        if (itemType === 'download') {
          const fileName = typeof raw.fileName === 'string' ? raw.fileName.trim() : '';
          if (!fileName) {
            errors.push({ section: si, item: ii, field: 'fileName', message: 'fileName is required for download items' });
            continue;
          }
        }

        const item: CourseItem = {
          id: uuidv4(),
          type: itemType,
          title: itemTitle,
          order: ii + 1,
          ...(raw.url && typeof raw.url === 'string' ? { url: raw.url.trim() } : {}),
          ...(raw.documentId && typeof raw.documentId === 'string' ? { documentId: raw.documentId.trim() } : {}),
          ...(raw.fileUrl && typeof raw.fileUrl === 'string' ? { fileUrl: raw.fileUrl.trim() } : {}),
          ...(raw.quizId && typeof raw.quizId === 'string' ? { quizId: raw.quizId.trim() } : {}),
          ...(raw.description && typeof raw.description === 'string' ? { description: raw.description.trim() } : {}),
          ...(raw.information && typeof raw.information === 'string' ? { information: raw.information.trim() } : {}),
          ...(raw.fileName && typeof raw.fileName === 'string' ? { fileName: raw.fileName.trim() } : {}),
        } as CourseItem;

        items.push(item);
        totalItems++;
      }

      importedSections.push({
        id: uuidv4(),
        title: secTitle,
        objective: typeof sec.objective === 'string' ? sec.objective.trim() : undefined,
        outcome: typeof sec.outcome === 'string' ? sec.outcome.trim() : undefined,
        items,
      });
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: { message: 'Import validation failed', details: errors },
      });
      return;
    }

    const existingSections = parseSections(existing.sections);
    const finalSections = mode === 'replace' ? importedSections : [...existingSections, ...importedSections];

    execute('UPDATE courses SET sections = ? WHERE id = ?', [JSON.stringify(finalSections), id]);

    const row = queryOne<CourseRow>(
      'SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?',
      [id],
    );

    res.json({
      success: true,
      data: {
        sectionsImported: importedSections.length,
        itemsImported: totalItems,
        course: rowToCourse(row!),
      },
    });
  } catch (error) {
    next(error);
  }
}

const ZIP_MAX_ENTRIES = 200;
const ZIP_MAX_EXTRACTED_BYTES = 200 * 1024 * 1024; // 200 MB

const MIME_FROM_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppsx': 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  '.zip': 'application/zip',
};

const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
  'text/markdown',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
]);

function inferMime(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_FROM_EXT[ext] || 'application/octet-stream';
}

export function itemTypeFromMime(mime: string): 'pdf' | 'download' | 'text' {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/markdown') return 'text';
  return 'download';
}

function stripExt(fileName: string): string {
  const base = path.basename(fileName);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

export interface ZipPreviewResult {
  sections: Array<{
    title: string;
    week: string;
    items: Array<{
      title: string;
      type: 'pdf' | 'download' | 'text';
      fileName: string;
      documentId: string;
      information?: string;
      warnings: string[];
    }>;
  }>;
  warnings: string[];
  filesStored: number;
  filesSkipped: number;
}

/**
 * Shared ZIP processing — opens a ZIP, filters/validates entries, stores documents,
 * and returns a preview structure. Used by both ZIP upload and GitHub import.
 */
export function processZipPreview(
  zipPath: string,
  courseId: string,
  uploadedById: string,
  subPath?: string,
): ZipPreviewResult {
  const normalizedSubPath = subPath?.trim() || undefined;

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw new AppError('File is not a valid ZIP archive', 400, ErrorCodes.VALIDATION_ERROR);
  }
  const entries = zip.getEntries();

  // Filter out directories, __MACOSX, dotfiles, path traversal
  let validEntries = entries.filter((e) => {
    if (e.isDirectory) return false;
    const name = e.entryName;
    if (name.startsWith('__MACOSX') || name.startsWith('.')) return false;
    if (name.includes('..')) return false;
    const baseName = path.basename(name);
    if (baseName.startsWith('.')) return false;
    return true;
  });

  // If subPath specified, filter entries to only those under that path
  // (GitHub zipballs have a root dir like "org-repo-sha/"; strip it first)
  if (normalizedSubPath) {
    const normalizedSub = normalizedSubPath.replace(/^\/+/, '').replace(/\/+$/, '');
    validEntries = validEntries.filter((e) => {
      // Strip the first path component (GitHub zipball root)
      const parts = e.entryName.split('/');
      const withoutRoot = parts.slice(1).join('/');
      return withoutRoot.startsWith(normalizedSub + '/') || withoutRoot === normalizedSub;
    });
  }

  if (validEntries.length === 0) {
    throw new AppError('ZIP contains no extractable files', 400, ErrorCodes.VALIDATION_ERROR);
  }

  if (validEntries.length > ZIP_MAX_ENTRIES) {
    throw new AppError(
      `ZIP contains ${validEntries.length} files, max ${ZIP_MAX_ENTRIES}`,
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  const totalSize = validEntries.reduce((sum, e) => sum + e.header.size, 0);
  if (totalSize > ZIP_MAX_EXTRACTED_BYTES) {
    throw new AppError(
      `Extracted size ${Math.round(totalSize / 1024 / 1024)}MB exceeds ${ZIP_MAX_EXTRACTED_BYTES / 1024 / 1024}MB limit`,
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  type PreviewItem = {
    title: string;
    type: 'pdf' | 'download' | 'text';
    fileName: string;
    documentId: string;
    information?: string;
    warnings: string[];
  };
  type PreviewSection = { title: string; week: string; items: PreviewItem[] };

  const sectionMap = new Map<string, PreviewSection>();
  const warnings: string[] = [];
  let filesStored = 0;
  let filesSkipped = 0;

  const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
  const now = new Date();
  const docDir = path.join(uploadDir, 'documents', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
  }

  for (const entry of validEntries) {
    const parts = entry.entryName.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1];
    const mime = inferMime(fileName);

    if (!ALLOWED_DOC_MIMES.has(mime)) {
      filesSkipped++;
      warnings.push(`Skipped "${fileName}" (unsupported type: ${mime})`);
      continue;
    }

    // Determine section mapping from folder structure
    // For GitHub zipballs, skip the root directory (first component)
    let mappingParts = parts;
    if (normalizedSubPath !== undefined) {
      // GitHub import: strip root dir
      mappingParts = parts.slice(1);
      // Also strip the subPath prefix from mapping
      const subParts = normalizedSubPath.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean);
      if (subParts.length > 0) {
        mappingParts = mappingParts.slice(subParts.length);
      }
    }

    let weekTitle: string;
    let sectionTitle: string;
    if (mappingParts.length >= 3) {
      weekTitle = mappingParts[0];
      sectionTitle = mappingParts[1];
    } else if (mappingParts.length === 2) {
      weekTitle = mappingParts[0];
      sectionTitle = 'Imported';
    } else {
      weekTitle = 'Imported';
      sectionTitle = 'Imported';
    }

    const docId = uuidv4();
    const ext = path.extname(fileName);
    const storedName = `${docId}${ext}`;
    const storedPath = path.join(docDir, storedName);

    const buffer = entry.getData();
    fs.writeFileSync(storedPath, buffer);

    execute(
      `INSERT INTO course_documents (id, title, description, category, file_name, file_size, file_path, file_mime_type, course_ids, uploaded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        stripExt(fileName),
        'Imported from ZIP',
        'Course Materials',
        fileName,
        buffer.length,
        storedPath,
        mime,
        JSON.stringify([courseId]),
        uploadedById,
      ],
    );
    filesStored++;

    // Render markdown to sanitized HTML
    let information: string | undefined;
    if (mime === 'text/markdown') {
      const mdContent = buffer.toString('utf-8');
      information = renderMarkdownToSafeHtml(mdContent);
    }

    const key = `${weekTitle}||${sectionTitle}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, { title: sectionTitle, week: weekTitle, items: [] });
    }
    sectionMap.get(key)!.items.push({
      title: stripExt(fileName),
      type: itemTypeFromMime(mime),
      fileName,
      documentId: docId,
      ...(information ? { information } : {}),
      warnings: [],
    });
  }

  // Check for duplicate file names within each section
  for (const section of sectionMap.values()) {
    const nameCount = new Map<string, number>();
    for (const item of section.items) {
      const n = item.fileName.toLowerCase();
      nameCount.set(n, (nameCount.get(n) || 0) + 1);
    }
    for (const item of section.items) {
      const n = item.fileName.toLowerCase();
      if ((nameCount.get(n) || 0) > 1) {
        item.warnings.push(`Duplicate: "${item.fileName}" in section "${section.title}"`);
      }
    }
  }

  return {
    sections: [...sectionMap.values()],
    warnings,
    filesStored,
    filesSkipped,
  };
}

export function importZipContent(req: AuthRequest, res: Response, next: NextFunction): void {
  const uploadedPath = req.file?.path;
  try {
    const { id } = req.params;
    const existing = queryOne<CourseRow>(
      'SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?',
      [id],
    );
    if (!existing) {
      if (uploadedPath) deleteFile(uploadedPath);
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Lecturer assignment guard
    if (req.user?.role === 'lecturer') {
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [id, req.user.userId],
      );
      if (!assigned) {
        if (uploadedPath) deleteFile(uploadedPath);
        throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
      }
    }

    if (!req.file) {
      throw new AppError('ZIP file is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const result = processZipPreview(req.file.path, id, req.user!.userId);
    deleteFile(req.file.path);

    res.json({ success: true, data: { preview: result } });
  } catch (error) {
    if (uploadedPath) deleteFile(uploadedPath);
    next(error);
  }
}

export async function importGitHubContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const existing = queryOne<CourseRow>(
      'SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?',
      [id],
    );
    if (!existing) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Lecturer assignment guard
    if (req.user?.role === 'lecturer') {
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [id, req.user.userId],
      );
      if (!assigned) {
        throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
      }
    }

    const { repoUrl, subPath, ref = 'main' } = req.body as {
      repoUrl?: string;
      subPath?: string;
      ref?: string;
    };

    if (!repoUrl || typeof repoUrl !== 'string') {
      throw new AppError('repoUrl is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const safeRef = (typeof ref === 'string' && ref.trim()) ? ref.trim() : 'main';

    const { owner, repo } = parseGitHubUrl(repoUrl);
    if (!isAllowedOrg(owner)) {
      throw new AppError(
        `Repository owner '${owner}' is not in the allowed list`,
        403,
        ErrorCodes.FORBIDDEN,
      );
    }

    let zipPath: string | undefined;
    try {
      zipPath = await fetchGitHubZip(owner, repo, safeRef);
      const result = processZipPreview(zipPath, id, req.user!.userId, subPath);
      res.json({ success: true, data: { preview: result } });
    } finally {
      if (zipPath) deleteFile(zipPath);
    }
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

    // Phase 23 C3: Emit enrollment notifications (best-effort)
    try {
      const courseInfo = queryOne<{ title: string }>(
        'SELECT title FROM courses WHERE id = ?',
        [courseId]
      );
      if (courseInfo) {
        createNotification({
          userId: targetUserId,
          type: 'course_enrolled',
          title: 'Course Enrolled',
          body: `You have been enrolled in "${courseInfo.title}"`,
          link: '/student/course',
        });
        // Notify the admin who performed the enrollment
        if (req.user!.userId !== targetUserId) {
          createNotification({
            userId: req.user!.userId,
            type: 'new_enrollment',
            title: 'New Enrollment',
            body: `A student has enrolled in "${courseInfo.title}"`,
          });
        }
      }
    } catch {
      // best-effort
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

// ── Lecturer assignment (Phase C) ────────────────────────────────────────────

export async function getLecturers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: courseId } = req.params;
    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    const rows = query<{ user_id: string; name: string; email: string; assigned_at: string }>(
      `SELECT cl.user_id, u.name, u.email, cl.assigned_at
       FROM course_lecturers cl
       INNER JOIN users u ON u.id = cl.user_id
       WHERE cl.course_id = ?
       ORDER BY u.name`,
      [courseId]
    );

    res.json({
      success: true,
      data: {
        lecturers: rows.map((r) => ({
          userId: r.user_id,
          name: r.name,
          email: r.email,
          assignedAt: r.assigned_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function addLecturer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: courseId } = req.params;
    const { userId } = req.body ?? {};
    const assignedBy = req.user?.userId;

    if (!userId) {
      throw new AppError('userId is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    const user = queryOne<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    }
    if (user.role !== 'lecturer') {
      throw new AppError('User is not a lecturer', 422, ErrorCodes.VALIDATION_ERROR);
    }

    const existing = queryOne<{ course_id: string }>(
      'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
      [courseId, userId]
    );
    if (existing) {
      throw new AppError('Lecturer already assigned to this course', 409, ErrorCodes.DUPLICATE_ENTRY);
    }

    execute(
      'INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)',
      [courseId, userId, assignedBy ?? null]
    );

    const row = queryOne<{ assigned_at: string }>(
      'SELECT assigned_at FROM course_lecturers WHERE course_id = ? AND user_id = ?',
      [courseId, userId]
    );

    res.status(201).json({
      success: true,
      data: { courseId, userId, assignedAt: row?.assigned_at },
    });
  } catch (error) {
    next(error);
  }
}

export async function removeLecturer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: courseId, lecturerUserId } = req.params;

    const deleted = execute(
      'DELETE FROM course_lecturers WHERE course_id = ? AND user_id = ?',
      [courseId, lecturerUserId]
    );
    if (deleted === 0) {
      throw new AppError('Lecturer assignment not found', 404, ErrorCodes.NOT_FOUND);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}
