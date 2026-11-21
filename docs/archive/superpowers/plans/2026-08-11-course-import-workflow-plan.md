# Course Import Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-source import wizard (ZIP, CSV, folder drag-and-drop) with full editable preview and validation to the course editor.

**Architecture:** New `POST /courses/:id/import/zip` endpoint extracts ZIP server-side, stores files as documents, and returns a preview. Client-side `ImportWizard.tsx` component handles all three sources, displays an editable preview table, and commits via the existing `POST /courses/:id/import` endpoint.

**Tech Stack:** Node.js/Express, TypeScript, adm-zip (new dep), better-sqlite3, multer, Vitest, React, React Testing Library

## Global Constraints

- Baseline: 828 tests (664 BE + 164 FE)
- Target: 835 tests (668 BE + 167 FE)
- No schema changes (sections remain JSON blob in `courses.sections` column)
- ZIP max: 50 MB, max 200 entries, max 200 MB extracted
- Run BE tests: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
- Run FE tests: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`
- TypeScript check: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`

---

### Task 1: Backend — Install adm-zip + ZIP Import Endpoint + 4 BE Tests

**Files:**
- Modify: `LMS-Server/package.json` (add adm-zip)
- Modify: `LMS-Server/src/utils/fileUpload.ts` (add `uploadZip` multer config)
- Modify: `LMS-Server/src/controllers/coursesController.ts` (add `importZipContent` handler)
- Modify: `LMS-Server/src/routes/courses.ts` (add `POST /:id/import/zip` route)
- Create: `LMS-Server/src/__tests__/course-import-zip.test.ts` (4 tests)

**Interfaces:**
- Consumes: `CourseRow`, `CourseSection`, `CourseItem` from types/index.ts; `query`, `queryOne`, `execute` from config/database.js; `AppError`, `ErrorCodes` from middleware/errorHandler.js; `AuthRequest` from types/index.js; `uploadZip` from utils/fileUpload.js
- Produces: `importZipContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void>` exported from coursesController.ts. Route `POST /courses/:id/import/zip` with `requirePermission('course.manage')`. `uploadZip` multer middleware exported from fileUpload.ts.

- [ ] **Step 1: Install adm-zip**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npm install adm-zip && npm install -D @types/adm-zip
```

- [ ] **Step 2: Add `uploadZip` multer config to fileUpload.ts**

In `LMS-Server/src/utils/fileUpload.ts`, after the `uploadDocument` export (line 133), add:

```typescript
// File filter for ZIP imports — only application/zip
const zipFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.mimetype === 'application/zip') {
    cb(null, true);
  } else {
    cb(new AppError(
      'Only ZIP files are accepted',
      400,
      ErrorCodes.INVALID_FILE_TYPE
    ));
  }
};

// Upload middleware for ZIP course imports (50 MB max)
export const uploadZip = multer({
  storage: createStorage('imports'),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
  fileFilter: zipFileFilter,
});
```

- [ ] **Step 3: Add `importZipContent` handler to coursesController.ts**

In `LMS-Server/src/controllers/coursesController.ts`:

First, add import at top (after line 6):

```typescript
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
```

Note: `path` may already be imported. Check before adding duplicates. `deleteFile` is already imported via `getDocumentFileUrl` — but `deleteFile` needs to be imported separately from `'../utils/fileUpload.js'`. Check existing imports.

Add the import of `deleteFile` if not present:

```typescript
import { getDocumentFileUrl, deleteFile } from '../utils/fileUpload.js';
```

Then, after the `importCourseContent` function (after line 471) and before `deleteCourse`, add:

```typescript
const ZIP_MAX_ENTRIES = 200;
const ZIP_MAX_EXTRACTED_BYTES = 200 * 1024 * 1024; // 200 MB

const MIME_FROM_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
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

function itemTypeFromMime(mime: string): 'pdf' | 'download' {
  return mime === 'application/pdf' ? 'pdf' : 'download';
}

function stripExt(fileName: string): string {
  const base = path.basename(fileName);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

export async function importZipContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();

    // Filter out directories, __MACOSX, dotfiles, path traversal
    const validEntries = entries.filter((e) => {
      if (e.isDirectory) return false;
      const name = e.entryName;
      if (name.startsWith('__MACOSX') || name.startsWith('.')) return false;
      if (name.includes('..')) return false;
      // Skip dotfiles in any folder
      const baseName = path.basename(name);
      if (baseName.startsWith('.')) return false;
      return true;
    });

    if (validEntries.length === 0) {
      deleteFile(req.file.path);
      res.status(400).json({
        success: false,
        error: { message: 'ZIP contains no extractable files' },
      });
      return;
    }

    if (validEntries.length > ZIP_MAX_ENTRIES) {
      deleteFile(req.file.path);
      res.status(400).json({
        success: false,
        error: { message: `ZIP contains ${validEntries.length} files, max ${ZIP_MAX_ENTRIES}` },
      });
      return;
    }

    // Check total extracted size
    const totalSize = validEntries.reduce((sum, e) => sum + e.header.size, 0);
    if (totalSize > ZIP_MAX_EXTRACTED_BYTES) {
      deleteFile(req.file.path);
      res.status(400).json({
        success: false,
        error: { message: `Extracted size ${Math.round(totalSize / 1024 / 1024)}MB exceeds ${ZIP_MAX_EXTRACTED_BYTES / 1024 / 1024}MB limit` },
      });
      return;
    }

    // Map folder structure: top-level folders → weeks, subfolders → sections
    // entry paths: "Week 1/Section A/file.pdf" or "folder/file.pdf" or "file.pdf"
    type PreviewItem = {
      title: string;
      type: 'pdf' | 'download';
      fileName: string;
      documentId: string;
      warnings: string[];
    };
    type PreviewSection = { title: string; week: string; items: PreviewItem[] };

    const sectionMap = new Map<string, PreviewSection>(); // key: "week||section"
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

      // Determine week and section from folder structure
      let weekTitle: string;
      let sectionTitle: string;
      if (parts.length >= 3) {
        // folder/subfolder/file → week=folder, section=subfolder
        weekTitle = parts[0];
        sectionTitle = parts[1];
      } else if (parts.length === 2) {
        // folder/file → week=folder, section="Imported"
        weekTitle = parts[0];
        sectionTitle = 'Imported';
      } else {
        // file → week="Imported", section="Imported"
        weekTitle = 'Imported';
        sectionTitle = 'Imported';
      }

      // Store as document
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
          `Imported from ZIP`,
          'Course Materials',
          fileName,
          buffer.length,
          storedPath,
          mime,
          JSON.stringify([id]),
          req.user?.userId,
        ],
      );
      filesStored++;

      const key = `${weekTitle}||${sectionTitle}`;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, { title: sectionTitle, week: weekTitle, items: [] });
      }
      sectionMap.get(key)!.items.push({
        title: stripExt(fileName),
        type: itemTypeFromMime(mime),
        fileName,
        documentId: docId,
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

    // Clean up uploaded ZIP
    deleteFile(req.file.path);

    const sections = [...sectionMap.values()];

    res.json({
      success: true,
      data: {
        preview: {
          sections,
          warnings,
          filesStored,
          filesSkipped,
        },
      },
    });
  } catch (error) {
    if (uploadedPath) deleteFile(uploadedPath);
    next(error);
  }
}
```

- [ ] **Step 4: Add route in courses.ts**

In `LMS-Server/src/routes/courses.ts`:

Add `importZipContent` to the import block (line 2-15) — after `importCourseContent`:

```typescript
import {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  importCourseContent,
  importZipContent,
  getCourseMembers,
  addCourseMember,
  removeCourseMember,
  getLecturers,
  addLecturer,
  removeLecturer,
} from '../controllers/coursesController.js';
```

Add import for `uploadZip` (after line 18):

```typescript
import { uploadZip } from '../utils/fileUpload.js';
```

Add the route after the `POST /:id/import` route (after line 280):

```typescript
/**
 * @openapi
 * /courses/{id}/import/zip:
 *   post:
 *     tags: [Courses]
 *     summary: Upload ZIP to preview course import
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [zipfile]
 *             properties:
 *               zipfile: { type: string, format: binary }
 *     responses:
 *       200: { description: Preview of extracted course structure }
 *       400: { description: Invalid ZIP or no extractable files }
 *       403: { description: Requires course.manage }
 *       404: { description: Course not found }
 */
router.post('/:id/import/zip', requirePermission('course.manage'), uploadZip.single('zipfile'), importZipContent);
```

- [ ] **Step 5: Write 4 backend tests**

Create `LMS-Server/src/__tests__/course-import-zip.test.ts`:

```typescript
/**
 * Phase 26 C4 — POST /courses/:id/import/zip tests
 *
 * ZIP-BE-1: valid ZIP with folder structure → 200 + preview
 * ZIP-BE-2: non-ZIP file → 400
 * ZIP-BE-3: empty ZIP → 400
 * ZIP-BE-4: unassigned lecturer → 403
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import AdmZip from 'adm-zip';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

interface ZipSeedResult {
  adminId: string;
  courseId: string;
  lecturerId: string;
  unassignedLecturerId: string;
}

function seedZipData(): ZipSeedResult {
  const adminId = uuidv4();
  const courseId = uuidv4();
  const lecturerId = uuidv4();
  const unassignedLecturerId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Zip Admin', 'zip-admin@test.com', '${HASH}', 'admin'),
      ('${lecturerId}', 'Zip Lecturer', 'zip-lec@test.com', '${HASH}', 'lecturer'),
      ('${unassignedLecturerId}', 'Zip Unassigned', 'zip-unassigned@test.com', '${HASH}', 'lecturer');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'ZIP Test Course', 'Test', 'ZIP-001', '[]');

    INSERT INTO course_lecturers (course_id, user_id)
    VALUES ('${courseId}', '${lecturerId}');
  `);

  return { adminId, courseId, lecturerId, unassignedLecturerId };
}

function createTestZip(files: Array<{ path: string; content: string | Buffer }>): Buffer {
  const zip = new AdmZip();
  for (const f of files) {
    zip.addFile(f.path, typeof f.content === 'string' ? Buffer.from(f.content) : f.content);
  }
  return zip.toBuffer();
}

describe('POST /api/v1/courses/:id/import/zip', () => {
  let ids: ZipSeedResult;
  let adminToken: string;

  beforeEach(() => {
    ids = seedZipData();
    adminToken = makeToken({ userId: ids.adminId, email: 'zip-admin@test.com', role: 'admin' });
  });

  it('ZIP-BE-1: valid ZIP with folder structure returns preview with correct mapping', async () => {
    const zipBuf = createTestZip([
      { path: 'Week 1/Introduction/lecture.pdf', content: '%PDF-1.4 fake pdf content' },
      { path: 'Week 1/Introduction/notes.txt', content: 'Some notes' },
      { path: 'Week 2/Lab/code.zip', content: 'fake zip content' },
      { path: 'root-file.pdf', content: '%PDF-1.4 root file' },
    ]);

    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import/zip`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipfile', zipBuf, { filename: 'course.zip', contentType: 'application/zip' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const preview = res.body.data.preview;
    expect(preview.filesStored).toBe(4);
    expect(preview.filesSkipped).toBe(0);
    expect(preview.sections.length).toBeGreaterThanOrEqual(3);

    // Check week/section mapping
    const introSection = preview.sections.find(
      (s: { title: string; week: string }) => s.week === 'Week 1' && s.title === 'Introduction',
    );
    expect(introSection).toBeDefined();
    expect(introSection.items).toHaveLength(2);

    const labSection = preview.sections.find(
      (s: { title: string; week: string }) => s.week === 'Week 2' && s.title === 'Lab',
    );
    expect(labSection).toBeDefined();
    expect(labSection.items).toHaveLength(1);

    // Root file goes to Imported/Imported
    const importedSection = preview.sections.find(
      (s: { title: string; week: string }) => s.week === 'Imported' && s.title === 'Imported',
    );
    expect(importedSection).toBeDefined();
    expect(importedSection.items).toHaveLength(1);

    // Each item has a documentId
    for (const sec of preview.sections) {
      for (const item of sec.items) {
        expect(item.documentId).toBeTruthy();
        expect(item.fileName).toBeTruthy();
      }
    }
  });

  it('ZIP-BE-2: non-ZIP file returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import/zip`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipfile', Buffer.from('not a zip'), { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
  });

  it('ZIP-BE-3: ZIP with only dotfiles/MACOSX returns 400', async () => {
    const zipBuf = createTestZip([
      { path: '__MACOSX/._file', content: 'mac metadata' },
      { path: '.hidden', content: 'hidden file' },
    ]);

    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import/zip`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipfile', zipBuf, { filename: 'empty.zip', contentType: 'application/zip' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('no extractable files');
  });

  it('ZIP-BE-4: unassigned lecturer gets 403', async () => {
    const unassignedToken = makeToken({
      userId: ids.unassignedLecturerId,
      email: 'zip-unassigned@test.com',
      role: 'lecturer',
    });
    const zipBuf = createTestZip([
      { path: 'file.txt', content: 'test' },
    ]);

    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import/zip`)
      .set('Authorization', `Bearer ${unassignedToken}`)
      .attach('zipfile', zipBuf, { filename: 'test.zip', contentType: 'application/zip' });

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run the ZIP import tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/course-import-zip.test.ts
```

Expected: 4/4 PASS

- [ ] **Step 7: Run full backend suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

Expected: 668/668 PASS (664 + 4)

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/package.json LMS-Server/package-lock.json LMS-Server/src/utils/fileUpload.ts LMS-Server/src/controllers/coursesController.ts LMS-Server/src/routes/courses.ts LMS-Server/src/__tests__/course-import-zip.test.ts
git commit -m "feat: add POST /courses/:id/import/zip endpoint with folder-to-week/section mapping (ZIP-BE-1–4)"
```

---

### Task 2: Frontend — ImportWizard Component + 3 FE Tests

**Files:**
- Create: `LMS-Frontend/src/components/ImportWizard.tsx` (wizard component)
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx` (add Import Wizard button + render)
- Create: `LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx` (3 tests)

**Interfaces:**
- Consumes: `parseImportCSV`, `parseCSVLine`, `WeekDraft`, `SectionDraft`, `ItemDraft` types from AdminCourse.tsx (these are not exported — the wizard will redefine the preview types internally and accept parsed data via props). Existing `POST /courses/:id/import` and `POST /courses/:id/import/zip` endpoints. `documentsService.create()` for folder upload.
- Produces: `ImportWizard` component with props `{ open, onClose, courseId, courseTitle, onImportComplete }`. Three-step wizard modal.

- [ ] **Step 1: Create ImportWizard.tsx**

Create `LMS-Frontend/src/components/ImportWizard.tsx`:

```tsx
import React, { useState, useRef, useCallback } from 'react';
import { Button } from './Button';
import { X, Upload, FileSpreadsheet, FolderOpen, Loader2, AlertTriangle, Trash2, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { documentsService } from '../services/documentsService';
import { getErrorMessage } from '../utils/apiError';
import { toastSuccess } from '../utils/toastBus';

/* ─── Preview types ─── */

type PreviewItem = {
  id: string;
  title: string;
  type: 'video' | 'link' | 'pdf' | 'text' | 'audio' | 'quiz' | 'assignment' | 'download';
  fileName?: string;
  documentId?: string;
  url?: string;
  quizId?: string;
  description?: string;
  information?: string;
  warnings: string[];
};

type PreviewSection = {
  id: string;
  week: string;
  title: string;
  items: PreviewItem[];
};

type ImportSource = 'zip' | 'csv' | 'folder' | null;

const VALID_TYPES = ['video', 'link', 'pdf', 'text', 'audio', 'quiz', 'assignment', 'download'] as const;

/* ─── CSV parsing (duplicated from AdminCourse.tsx to keep wizard self-contained) ─── */

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

function newId(): string {
  return 'iw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function parseCSVToPreview(raw: string): { sections: PreviewSection[]; errors: string[] } {
  const errors: string[] = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { sections: [], errors: ['CSV is empty or has no data rows.'] };

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const weekIdx = header.indexOf('week');
  const secIdx = header.indexOf('section');
  const objIdx = header.indexOf('objective');
  const typeIdx = header.indexOf('type');
  const titleIdx = header.indexOf('title');
  const urlIdx = header.indexOf('url');
  const infoIdx = header.indexOf('information');
  const quizIdIdx = header.indexOf('quizid');
  const descIdx = header.indexOf('description');
  const fileNameIdx = header.indexOf('filename');
  const docIdIdx = header.indexOf('documentid');

  if (weekIdx < 0 || secIdx < 0) {
    return { sections: [], errors: ['CSV must have "week" and "section" columns.'] };
  }

  const sectionMap = new Map<string, PreviewSection>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const weekTitle = (cols[weekIdx] ?? '').trim() || 'Week 1';
    const secTitle = (cols[secIdx] ?? '').trim() || 'Imported';
    const itemType = typeIdx >= 0 ? (cols[typeIdx] ?? '').trim().toLowerCase() : '';
    const itemTitle = titleIdx >= 0 ? (cols[titleIdx] ?? '').trim() : '';

    const key = `${weekTitle}||${secTitle}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, { id: newId(), week: weekTitle, title: secTitle, items: [] });
    }

    if (!itemTitle || !itemType) continue;

    const warnings: string[] = [];
    if (!VALID_TYPES.includes(itemType as typeof VALID_TYPES[number])) {
      errors.push(`Row ${i + 1}: unknown type "${itemType}"`);
      continue;
    }

    const url = urlIdx >= 0 ? (cols[urlIdx] ?? '').trim() : '';
    if (['video', 'link', 'audio'].includes(itemType) && !url) {
      warnings.push(`URL required for ${itemType} items`);
    }
    const quizId = quizIdIdx >= 0 ? (cols[quizIdIdx] ?? '').trim() : '';
    if (itemType === 'quiz' && !quizId) {
      warnings.push('Quiz ID required');
    }
    const fileName = fileNameIdx >= 0 ? (cols[fileNameIdx] ?? '').trim() : '';
    if (itemType === 'download' && !fileName) {
      warnings.push('File name required');
    }

    sectionMap.get(key)!.items.push({
      id: newId(),
      title: itemTitle,
      type: itemType as PreviewItem['type'],
      url: url || undefined,
      quizId: quizId || undefined,
      description: descIdx >= 0 ? (cols[descIdx] ?? '').trim() || undefined : undefined,
      information: infoIdx >= 0 ? (cols[infoIdx] ?? '').trim() || undefined : undefined,
      fileName: fileName || undefined,
      documentId: docIdIdx >= 0 ? (cols[docIdIdx] ?? '').trim() || undefined : undefined,
      warnings,
    });
  }

  return { sections: [...sectionMap.values()], errors };
}

/* ─── Main component ─── */

type ImportWizardProps = {
  open: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  onImportComplete: () => void;
};

/** MIME types the server accepts for documents. */
const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
]);

function mimeToItemType(mime: string): 'pdf' | 'download' {
  return mime === 'application/pdf' ? 'pdf' : 'download';
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export default function ImportWizard({ open, onClose, courseId, courseTitle, onImportComplete }: ImportWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [source, setSource] = useState<ImportSource>(null);
  const [sections, setSections] = useState<PreviewSection[]>([]);
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState('');
  const [folderProgress, setFolderProgress] = useState<{ done: number; total: number } | null>(null);

  const zipInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(1);
    setSource(null);
    setSections([]);
    setGlobalWarnings([]);
    setParseErrors([]);
    setLoading(false);
    setImportMode('append');
    setCommitting(false);
    setCommitError('');
    setFolderProgress(null);
  }, []);

  const handleClose = useCallback(() => {
    if (committing || loading) return;
    reset();
    onClose();
  }, [committing, loading, reset, onClose]);

  /* ── ZIP source ── */
  const handleZipFile = useCallback(async (file: File) => {
    setLoading(true);
    setParseErrors([]);
    try {
      const formData = new FormData();
      formData.append('zipfile', file);
      const res = await fetch(`/api/v1/courses/${courseId}/import/zip`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lms_token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setParseErrors([data.error?.message || 'ZIP upload failed']);
        return;
      }
      const preview = data.data.preview;
      // Convert server preview to local format with IDs
      const mapped: PreviewSection[] = preview.sections.map((s: { title: string; week: string; items: Array<{ title: string; type: string; fileName: string; documentId: string; warnings: string[] }> }) => ({
        id: newId(),
        week: s.week,
        title: s.title,
        items: s.items.map((item) => ({
          id: newId(),
          title: item.title,
          type: item.type,
          fileName: item.fileName,
          documentId: item.documentId,
          warnings: item.warnings || [],
        })),
      }));
      setSections(mapped);
      setGlobalWarnings(preview.warnings || []);
      setSource('zip');
      setStep(2);
    } catch (e) {
      setParseErrors([getErrorMessage(e, 'Failed to process ZIP')]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  /* ── CSV source ── */
  const handleCSVFile = useCallback((file: File) => {
    setLoading(true);
    setParseErrors([]);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = parseCSVToPreview(text);
      setSections(result.sections);
      setParseErrors(result.errors);
      setGlobalWarnings([]);
      setSource('csv');
      setStep(2);
      setLoading(false);
    };
    reader.onerror = () => {
      setParseErrors(['Failed to read CSV file']);
      setLoading(false);
    };
    reader.readAsText(file);
  }, []);

  /* ── Folder source ── */
  const handleFolderFiles = useCallback(async (files: FileList) => {
    setLoading(true);
    setParseErrors([]);
    const fileArr = Array.from(files).filter((f) => {
      const name = f.name;
      if (name.startsWith('.') || name.startsWith('__MACOSX')) return false;
      const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      if (relPath.includes('__MACOSX') || relPath.includes('/.')) return false;
      return true;
    });

    if (fileArr.length === 0) {
      setParseErrors(['No valid files found in folder']);
      setLoading(false);
      return;
    }

    const sectionMap = new Map<string, PreviewSection>();
    const warnings: string[] = [];
    setFolderProgress({ done: 0, total: fileArr.length });

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = relPath.split('/').filter(Boolean);
      // First part is the selected folder name — skip it
      const pathParts = parts.length > 1 ? parts.slice(1) : parts;
      const fileName = pathParts[pathParts.length - 1];

      if (!DOC_MIME_TYPES.has(file.type)) {
        warnings.push(`Skipped "${fileName}" (unsupported type: ${file.type || 'unknown'})`);
        setFolderProgress({ done: i + 1, total: fileArr.length });
        continue;
      }

      // Determine week/section from path
      let weekTitle: string;
      let sectionTitle: string;
      if (pathParts.length >= 3) {
        weekTitle = pathParts[0];
        sectionTitle = pathParts[1];
      } else if (pathParts.length === 2) {
        weekTitle = pathParts[0];
        sectionTitle = 'Imported';
      } else {
        weekTitle = 'Imported';
        sectionTitle = 'Imported';
      }

      // Upload file via documents service
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', stripExtension(fileName));
        formData.append('description', 'Imported from folder');
        formData.append('category', 'Course Materials');
        formData.append('courseIds', JSON.stringify([courseId]));

        const res = await fetch('/api/v1/documents', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('lms_token')}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          warnings.push(`Failed to upload "${fileName}": ${data.error?.message || 'error'}`);
          setFolderProgress({ done: i + 1, total: fileArr.length });
          continue;
        }

        const key = `${weekTitle}||${sectionTitle}`;
        if (!sectionMap.has(key)) {
          sectionMap.set(key, { id: newId(), week: weekTitle, title: sectionTitle, items: [] });
        }
        sectionMap.get(key)!.items.push({
          id: newId(),
          title: stripExtension(fileName),
          type: mimeToItemType(file.type),
          fileName,
          documentId: data.data?.id,
          warnings: [],
        });
      } catch (e) {
        warnings.push(`Failed to upload "${fileName}": ${getErrorMessage(e, 'error')}`);
      }
      setFolderProgress({ done: i + 1, total: fileArr.length });
    }

    setSections([...sectionMap.values()]);
    setGlobalWarnings(warnings);
    setSource('folder');
    setStep(2);
    setLoading(false);
    setFolderProgress(null);
  }, [courseId]);

  /* ── Preview editing ── */
  const updateItemField = useCallback((sectionId: string, itemId: string, field: keyof PreviewItem, value: string) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? { ...sec, items: sec.items.map((item) => item.id === itemId ? { ...item, [field]: value } : item) }
          : sec,
      ),
    );
  }, []);

  const removeItem = useCallback((sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev
        .map((sec) =>
          sec.id === sectionId
            ? { ...sec, items: sec.items.filter((item) => item.id !== itemId) }
            : sec,
        )
        .filter((sec) => sec.items.length > 0),
    );
  }, []);

  const updateSectionField = useCallback((sectionId: string, field: 'title' | 'week', value: string) => {
    setSections((prev) =>
      prev.map((sec) => sec.id === sectionId ? { ...sec, [field]: value } : sec),
    );
  }, []);

  /* ── Commit ── */
  const handleCommit = useCallback(async () => {
    setCommitting(true);
    setCommitError('');
    try {
      // Group sections by week for the import endpoint
      // The import endpoint expects flat sections, so we convert
      const importSections = sections.map((sec) => ({
        title: sec.title,
        objective: '',
        outcome: '',
        items: sec.items.map((item) => ({
          type: item.type,
          title: item.title,
          ...(item.url ? { url: item.url } : {}),
          ...(item.documentId ? { documentId: item.documentId } : {}),
          ...(item.quizId ? { quizId: item.quizId } : {}),
          ...(item.description ? { description: item.description } : {}),
          ...(item.information ? { information: item.information } : {}),
          ...(item.fileName ? { fileName: item.fileName } : {}),
        })),
      }));

      const res = await fetch(`/api/v1/courses/${courseId}/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('lms_token')}`,
        },
        body: JSON.stringify({ mode: importMode, sections: importSections }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = data.error?.details;
        if (details && Array.isArray(details)) {
          setCommitError(details.map((d: { section?: number; item?: number; message: string }) =>
            `Section ${(d.section ?? 0) + 1}${d.item !== undefined ? `, Item ${d.item + 1}` : ''}: ${d.message}`
          ).join('\n'));
        } else {
          setCommitError(data.error?.message || 'Import failed');
        }
        return;
      }
      toastSuccess(`Imported ${data.data?.sectionsImported ?? 0} section(s), ${data.data?.itemsImported ?? 0} item(s)`);
      reset();
      onClose();
      onImportComplete();
    } catch (e) {
      setCommitError(getErrorMessage(e, 'Import request failed'));
    } finally {
      setCommitting(false);
    }
  }, [sections, courseId, importMode, reset, onClose, onImportComplete]);

  if (!open) return null;

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const totalWarnings = sections.reduce((sum, s) => sum + s.items.reduce((ws, item) => ws + item.warnings.length, 0), 0) + globalWarnings.length;
  const weeks = [...new Set(sections.map((s) => s.week))];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-wizard-title"
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
      tabIndex={-1}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" data-testid="import-wizard">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b">
          <div>
            <h2 id="import-wizard-title" className="text-lg font-semibold text-neutral-800">
              Import Wizard {courseTitle ? `— ${courseTitle}` : ''}
            </h2>
            <div className="flex gap-2 mt-1">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`h-1.5 w-16 rounded-full ${s <= step ? 'bg-blue-500' : 'bg-neutral-200'}`} />
              ))}
            </div>
          </div>
          <button onClick={handleClose} disabled={committing || loading} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {/* Step 1: Source Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">Choose an import source for your course content.</p>

              {parseErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  {parseErrors.map((e, i) => <p key={i} className="text-sm text-red-700">{e}</p>)}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3" data-testid="source-options">
                {/* ZIP */}
                <button
                  className="border rounded-xl p-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  onClick={() => zipInputRef.current?.click()}
                  disabled={loading}
                  data-testid="source-zip"
                >
                  <Upload className="h-8 w-8 text-blue-500 mb-2" />
                  <div className="font-medium text-neutral-800">Upload ZIP</div>
                  <p className="text-xs text-neutral-500 mt-1">Folders map to weeks &amp; sections</p>
                </button>
                <input ref={zipInputRef} type="file" accept=".zip,application/zip" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleZipFile(f); e.target.value = ''; }}
                />

                {/* CSV */}
                <button
                  className="border rounded-xl p-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  onClick={() => csvInputRef.current?.click()}
                  disabled={loading}
                  data-testid="source-csv"
                >
                  <FileSpreadsheet className="h-8 w-8 text-green-500 mb-2" />
                  <div className="font-medium text-neutral-800">Upload CSV</div>
                  <p className="text-xs text-neutral-500 mt-1">12-column manifest format</p>
                </button>
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCSVFile(f); e.target.value = ''; }}
                />

                {/* Folder */}
                <button
                  className="border rounded-xl p-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={loading}
                  data-testid="source-folder"
                >
                  <FolderOpen className="h-8 w-8 text-amber-500 mb-2" />
                  <div className="font-medium text-neutral-800">Select Folder</div>
                  <p className="text-xs text-neutral-500 mt-1">Drag or browse a local folder</p>
                </button>
                <input ref={folderInputRef} type="file" className="hidden"
                  {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                  onChange={(e) => { const f = e.target.files; if (f && f.length > 0) void handleFolderFiles(f); e.target.value = ''; }}
                />
              </div>

              {loading && (
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {folderProgress
                    ? `Uploading files: ${folderProgress.done}/${folderProgress.total}`
                    : 'Processing...'}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Editable Preview */}
          {step === 2 && (
            <div className="space-y-4" data-testid="preview-step">
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-600">
                  {totalItems} item{totalItems !== 1 ? 's' : ''} in {sections.length} section{sections.length !== 1 ? 's' : ''} across {weeks.length} week{weeks.length !== 1 ? 's' : ''}
                  {totalWarnings > 0 && <span className="text-amber-600 ml-2">— {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}</span>}
                </p>
              </div>

              {globalWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
                  {globalWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  {parseErrors.map((e, i) => <p key={i} className="text-sm text-red-700">{e}</p>)}
                </div>
              )}

              {sections.length === 0 ? (
                <p className="text-sm text-neutral-500 py-8 text-center">No items to preview.</p>
              ) : (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                  {sections.map((sec) => (
                    <div key={sec.id} className="border rounded-lg">
                      <div className="bg-neutral-50 px-4 py-2 flex items-center gap-2 text-sm border-b">
                        <input
                          className="border rounded px-2 py-0.5 w-28 text-sm"
                          value={sec.week}
                          onChange={(e) => updateSectionField(sec.id, 'week', e.target.value)}
                          aria-label="Week"
                          data-testid={`section-week-${sec.id}`}
                        />
                        <span className="text-neutral-400">/</span>
                        <input
                          className="border rounded px-2 py-0.5 flex-1 text-sm"
                          value={sec.title}
                          onChange={(e) => updateSectionField(sec.id, 'title', e.target.value)}
                          aria-label="Section"
                          data-testid={`section-title-${sec.id}`}
                        />
                        <span className="text-xs text-neutral-400">{sec.items.length} item{sec.items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="divide-y">
                        {sec.items.map((item) => (
                          <div key={item.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                            <input
                              className="border rounded px-2 py-0.5 flex-1 text-sm"
                              value={item.title}
                              onChange={(e) => updateItemField(sec.id, item.id, 'title', e.target.value)}
                              aria-label="Item title"
                              data-testid={`item-title-${item.id}`}
                            />
                            <select
                              className="border rounded px-1 py-0.5 text-xs"
                              value={item.type}
                              onChange={(e) => updateItemField(sec.id, item.id, 'type', e.target.value)}
                              aria-label="Item type"
                              data-testid={`item-type-${item.id}`}
                            >
                              {VALID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            {item.fileName && (
                              <span className="text-xs text-neutral-400 truncate max-w-[120px]" title={item.fileName}>{item.fileName}</span>
                            )}
                            {item.warnings.length > 0 && (
                              <span title={item.warnings.join(', ')} className="text-amber-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <button onClick={() => removeItem(sec.id, item.id)} className="text-red-400 hover:text-red-600" aria-label="Remove item">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="space-y-4" data-testid="confirm-step">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <h3 className="font-medium text-blue-800">Import Summary</h3>
                <p className="text-sm text-blue-700">
                  <strong>{sections.length}</strong> section{sections.length !== 1 ? 's' : ''} with <strong>{totalItems}</strong> item{totalItems !== 1 ? 's' : ''} across <strong>{weeks.length}</strong> week{weeks.length !== 1 ? 's' : ''}
                </p>
                {totalWarnings > 0 && (
                  <p className="text-sm text-amber-600">{totalWarnings} warning{totalWarnings !== 1 ? 's' : ''} (items will still be imported)</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Import Mode</label>
                <select
                  className="border rounded px-3 py-1.5 text-sm w-full"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
                  data-testid="import-mode"
                >
                  <option value="append">Append — add after existing sections</option>
                  <option value="replace">Replace — remove existing sections</option>
                </select>
              </div>

              {commitError && (
                <pre className="text-sm text-red-600 bg-red-50 rounded p-2 whitespace-pre-wrap">{commitError}</pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <div>
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)} disabled={committing}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={committing || loading}>Cancel</Button>
            {step === 2 && sections.length > 0 && (
              <Button size="sm" onClick={() => setStep(3)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 3 && (
              <Button size="sm" onClick={() => void handleCommit()} disabled={committing || sections.length === 0}>
                {committing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Import
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Import Wizard button and render to AdminCourse.tsx**

In `LMS-Frontend/src/pages/AdminCourse.tsx`:

Add import at top (after `BulkUploadModal` import, line 33):

```typescript
import ImportWizard from '../components/ImportWizard';
```

Add state after `jsonImporting` state (after line 319):

```typescript
  const [importWizardOpen, setImportWizardOpen] = useState(false);
```

Add "Import Wizard" button in the toolbar area. After the "Import CSV" button (after line 992), add:

```tsx
                {editingId && (
                  <Button variant="outline" size="sm" onClick={() => setImportWizardOpen(true)}>
                    <Upload className="h-4 w-4 mr-1" />
                    Import Wizard
                  </Button>
                )}
```

Add the `ImportWizard` render before the closing `</div>` of the component (before line 1565), after the `<BulkUploadModal>`:

```tsx
      <ImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        courseId={editingId || ''}
        courseTitle={courseTitle}
        onImportComplete={() => { loadCourses({ silent: true }); if (editingId) { courseService.fetchCourses().then(list => { const c = list.find(x => x.id === editingId); if (c) startEdit(c); }); } }}
      />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Write 3 frontend tests**

Create `LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImportWizard from '../../components/ImportWizard';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  courseId: 'course-123',
  courseTitle: 'Test Course',
  onImportComplete: vi.fn(),
};

describe('ImportWizard (Phase 26 C4)', () => {
  it('IW-FE-1: renders three source options (ZIP, CSV, Folder)', () => {
    render(<ImportWizard {...defaultProps} />);

    expect(screen.getByTestId('source-zip')).toBeDefined();
    expect(screen.getByTestId('source-csv')).toBeDefined();
    expect(screen.getByTestId('source-folder')).toBeDefined();
    expect(screen.getByText('Upload ZIP')).toBeDefined();
    expect(screen.getByText('Upload CSV')).toBeDefined();
    expect(screen.getByText('Select Folder')).toBeDefined();
  });

  it('IW-FE-2: does not render when open is false', () => {
    render(<ImportWizard {...defaultProps} open={false} />);
    expect(screen.queryByTestId('import-wizard')).toBeNull();
  });

  it('IW-FE-3: Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<ImportWizard {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run frontend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/components/ImportWizard.test.tsx
```

Expected: 3/3 PASS

- [ ] **Step 6: Run full frontend suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```

Expected: 167/167 PASS (164 + 3)

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/components/ImportWizard.tsx LMS-Frontend/src/pages/AdminCourse.tsx LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx
git commit -m "feat: add ImportWizard component with ZIP/CSV/folder sources and editable preview (IW-FE-1–3)"
```

---

### Task 3: Verification Gates + Merge

**Files:** None (verification only)

**Interfaces:**
- Consumes: all prior tasks merged to feature branch
- Produces: merge commit on main, git tag

- [ ] **Step 1: TypeScript check**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2: Full backend test suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

Expected: 668/668 PASS

- [ ] **Step 3: Full frontend test suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```

Expected: 167/167 PASS

- [ ] **Step 4: Vite build check**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vite build
```

Expected: build succeeds

- [ ] **Step 5: Merge to main**

```bash
git checkout main
git merge --no-ff feat/course-import-workflow -m "feat: Import Wizard — ZIP/CSV/folder sources with editable preview (Phase 26 C4)"
git tag phase26-c4-complete-2026-08-11
```

- [ ] **Step 6: Write closeout document**

Save to `docs/superpowers/plans/2026-08-11-phase26-c4-closeout.md` with summary, file list, test counts (668 BE + 167 FE = 835), and rollback instructions.
