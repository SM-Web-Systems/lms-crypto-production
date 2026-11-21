# Course Bulk Upload UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins and lecturers bulk-upload courseware files via a drag-and-drop modal, and grant lecturers access to the course editor for their assigned courses.

**Architecture:** Enhance `ProtectedRoute` to accept an `allowedRoles` array, add a `/lecturer/course` route sharing the existing `AdminCourse` page, and add a `BulkUploadModal` component that uploads files one-by-one via the existing `documentsService.create()` → `POST /documents` endpoint, auto-detects item type from MIME, and adds items to the selected section. No new backend endpoints.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, React Testing Library, Express, better-sqlite3, supertest

## Global Constraints

- Baseline: 814 tests (656 BE + 158 FE)
- Target: 822 tests (660 BE + 162 FE)
- Max file size: 10 MB per file (`MAX_FILE_SIZE` in `fileUpload.ts`)
- Max batch: 20 files
- Accepted MIME types match `DOCUMENT_MIME_TYPES` in `LMS-Server/src/utils/fileUpload.ts` (no audio — server does not accept audio MIME types via `POST /documents`)
- No new backend endpoints — reuse existing `POST /documents`
- No schema changes
- Run BE tests: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
- Run FE tests: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`
- TypeScript check: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `LMS-Frontend/src/App.tsx` | Modify | Add `allowedRoles` prop to `ProtectedRoute`, add `/lecturer/course` route |
| `LMS-Frontend/src/components/Layout.tsx` | Modify | Add "Course Editor" nav link for lecturers |
| `LMS-Frontend/src/components/BulkUploadModal.tsx` | Create | Drag-and-drop bulk upload modal with progress and retry |
| `LMS-Frontend/src/pages/AdminCourse.tsx` | Modify | Add "Bulk Upload" button, import and render `BulkUploadModal` |
| `LMS-Frontend/src/__tests__/components/BulkUploadModal.test.tsx` | Create | 4 FE tests (BULK-UP-FE-1–4) |
| `LMS-Server/src/__tests__/course-bulk-upload.test.ts` | Create | 4 BE tests (BULK-UP-BE-1–4) |

---

### Task 1: Backend Tests — Lecturer Course Access + Document Upload

**Files:**
- Create: `LMS-Server/src/__tests__/course-bulk-upload.test.ts`
- Reference: `LMS-Server/src/__tests__/helpers/seed.ts`, `LMS-Server/src/__tests__/helpers/auth.ts`

**Interfaces:**
- Consumes: `seedTestData()` from `helpers/seed.ts`, `makeToken()` from `helpers/auth.ts`, `app` from `../app.js`, `db` from `../config/database.js`
- Produces: 4 passing BE tests (BULK-UP-BE-1–4). No exports consumed by other tasks.

- [ ] **Step 1: Write the 4 backend tests**

Create `LMS-Server/src/__tests__/course-bulk-upload.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { seedTestData, type TestIds } from './helpers/seed.js';

const HASH = bcrypt.hashSync('password123', 4);

let ids: TestIds;
let adminToken: string;
let lecturerUserId: string;
let lecturerToken: string;
let unassignedLecturerToken: string;

function seedLecturerData() {
  // Create lecturer user assigned to course
  lecturerUserId = uuidv4();
  const unassignedLecturerId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test Lecturer', ?, ?, 'lecturer')`,
  ).run(lecturerUserId, `lecturer-${lecturerUserId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Unassigned Lecturer', ?, ?, 'lecturer')`,
  ).run(unassignedLecturerId, `lecturer2-${unassignedLecturerId}@test.com`, HASH);

  // Assign lecturer to course via course_lecturers
  db.prepare(
    `INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)`,
  ).run(ids.courseId, lecturerUserId, ids.adminId);

  lecturerToken = makeToken({ userId: lecturerUserId, email: `lecturer-${lecturerUserId}@test.com`, role: 'lecturer' });
  unassignedLecturerToken = makeToken({ userId: unassignedLecturerId, email: `lecturer2-${unassignedLecturerId}@test.com`, role: 'lecturer' });
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
}

beforeEach(() => {
  ids = seedTestData();
  seedLecturerData();
});

describe('Course Bulk Upload — Lecturer Access (Phase 26 C2)', () => {
  it('BULK-UP-BE-1: lecturer with course assignment can GET /courses and see assigned courses', async () => {
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${lecturerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const courseIds = res.body.data.courses.map((c: { id: string }) => c.id);
    expect(courseIds).toContain(ids.courseId);
  });

  it('BULK-UP-BE-2: lecturer with course assignment can PUT /courses/:id to update sections', async () => {
    const updatedSections = [
      {
        id: uuidv4(),
        title: 'Updated Section',
        objective: 'Test objective',
        outcome: 'Test outcome',
        items: [
          { id: uuidv4(), type: 'video', title: 'New Video', order: 1, url: 'https://youtube.com/watch?v=test' },
        ],
      },
    ];

    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({ sections: updatedSections });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sections).toHaveLength(1);
    expect(res.body.data.sections[0].title).toBe('Updated Section');
  });

  it('BULK-UP-BE-3: lecturer without course assignment cannot update a course', async () => {
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${unassignedLecturerToken}`)
      .send({ sections: [] });

    // The unassigned lecturer has course.manage permission (via instructor role),
    // but getCourse checks course_lecturers assignment and returns 403
    expect(res.status).toBe(403);
  });

  it('BULK-UP-BE-4: POST /documents with valid PDF file returns document with ID', async () => {
    // Create a minimal PDF buffer
    const pdfContent = Buffer.from('%PDF-1.4 test content');
    const tmpDir = path.join('/tmp', 'bulk-upload-test-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'test-upload.pdf');
    fs.writeFileSync(tmpFile, pdfContent);

    try {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Bulk Upload Test Doc')
        .field('description', 'Test document for bulk upload')
        .field('category', 'Course Materials')
        .attach('file', tmpFile, { contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe('Bulk Upload Test Doc');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/course-bulk-upload.test.ts
```

Expected: 4/4 PASS

- [ ] **Step 3: Run full backend suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

Expected: 660/660 PASS (656 + 4)

- [ ] **Step 4: Commit**

```bash
git add LMS-Server/src/__tests__/course-bulk-upload.test.ts
git commit -m "test: add 4 BE tests for lecturer course access and document upload (BULK-UP-BE-1–4)"
```

---

### Task 2: Lecturer Course Access — ProtectedRoute, Route, Nav Link

**Files:**
- Modify: `LMS-Frontend/src/App.tsx:59-78` (ProtectedRoute component) and `:319-328` (AdminCourse route) and add new route after `:430`
- Modify: `LMS-Frontend/src/components/Layout.tsx:84-90` (lecturer nav array)

**Interfaces:**
- Consumes: existing `AdminCourse` page component, existing `ProtectedRoute` inline component
- Produces: `ProtectedRoute` now accepts optional `allowedRoles?: string[]` prop (in addition to `allowedRole`). New route `/lecturer/course` renders `AdminCourse`. Lecturer nav shows "Course Editor" link.

- [ ] **Step 1: Modify ProtectedRoute to support allowedRoles array**

In `LMS-Frontend/src/App.tsx`, change the `ProtectedRoute` component (lines 59–78):

**Replace:**
```tsx
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRole?: 'student' | 'admin' | 'lecturer';
}> = ({ children, allowedRole }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && user?.role !== allowedRole) {
    return <Navigate to={roleHome(user?.role)} replace />;
  }

  return <>{children}</>;
};
```

**With:**
```tsx
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRole?: 'student' | 'admin' | 'lecturer';
  allowedRoles?: Array<'student' | 'admin' | 'lecturer'>;
}> = ({ children, allowedRole, allowedRoles }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role as 'student' | 'admin' | 'lecturer')) {
    return <Navigate to={roleHome(user?.role)} replace />;
  }

  if (allowedRole && user?.role !== allowedRole) {
    return <Navigate to={roleHome(user?.role)} replace />;
  }

  return <>{children}</>;
};
```

- [ ] **Step 2: Change AdminCourse route to allow both admin and lecturer**

In `LMS-Frontend/src/App.tsx`, change the AdminCourse route (lines 319–328):

**Replace:**
```tsx
            <Route
              path="/admin/course"
              element={
                <ProtectedRoute allowedRole="admin">
                  <Layout>
                    <AdminCourse />
                  </Layout>
                </ProtectedRoute>
              }
            />
```

**With:**
```tsx
            <Route
              path="/admin/course"
              element={
                <ProtectedRoute allowedRoles={['admin', 'lecturer']}>
                  <Layout>
                    <AdminCourse />
                  </Layout>
                </ProtectedRoute>
              }
            />
```

- [ ] **Step 3: Add /lecturer/course route**

In `LMS-Frontend/src/App.tsx`, after the `/lecturer/courses/:courseId` route (after line 430), add:

```tsx
            <Route
              path="/lecturer/course"
              element={
                <ProtectedRoute allowedRole="lecturer">
                  <Layout>
                    <AdminCourse />
                  </Layout>
                </ProtectedRoute>
              }
            />
```

- [ ] **Step 4: Add "Course Editor" nav link for lecturers**

In `LMS-Frontend/src/components/Layout.tsx`, change the lecturer nav array (lines 85–90):

**Replace:**
```tsx
      ? [
          { name: 'Dashboard', path: '/lecturer', icon: LayoutDashboard },
          { name: 'Submissions', path: '/lecturer/submissions', icon: FileText },
          { name: 'Messages', path: '/lecturer/messages', icon: Mail },
          { name: 'Profile', path: '/lecturer/profile', icon: User },
        ]
```

**With:**
```tsx
      ? [
          { name: 'Dashboard', path: '/lecturer', icon: LayoutDashboard },
          { name: 'Course Editor', path: '/lecturer/course', icon: BookOpen },
          { name: 'Submissions', path: '/lecturer/submissions', icon: FileText },
          { name: 'Messages', path: '/lecturer/messages', icon: Mail },
          { name: 'Profile', path: '/lecturer/profile', icon: User },
        ]
```

`BookOpen` is already imported in Layout.tsx (used in admin nav).

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add LMS-Frontend/src/App.tsx LMS-Frontend/src/components/Layout.tsx
git commit -m "feat: allow lecturers to access course editor via /lecturer/course route"
```

---

### Task 3: BulkUploadModal Component

**Files:**
- Create: `LMS-Frontend/src/components/BulkUploadModal.tsx`

**Interfaces:**
- Consumes: `documentsService.create()` from `services/documentsService.ts` (takes `CreateDocumentData`, returns `Promise<CourseDocument>`); `getErrorMessage()` from `utils/apiError.ts`
- Produces: `BulkUploadModal` component with props:
  ```typescript
  interface BulkUploadModalProps {
    open: boolean;
    onClose: () => void;
    weeks: Array<{ tempId: string; title: string; sections: Array<{ tempId: string; title: string }> }>;
    courseTitle: string;
    courseId: string | null;
    docCategories: string[];
    onFilesUploaded: (items: Array<{ documentId: string; title: string; type: 'pdf' | 'download'; fileName: string }>, weekTempId: string, sectionTempId: string) => void;
  }
  ```

- [ ] **Step 1: Create BulkUploadModal.tsx**

Create `LMS-Frontend/src/components/BulkUploadModal.tsx`:

```tsx
import React, { useState, useRef, useCallback } from 'react';
import { Button } from './Button';
import { X, Upload, AlertCircle, CheckCircle, Loader2, RotateCcw } from 'lucide-react';
import { documentsService } from '../services/documentsService';
import { getErrorMessage } from '../utils/apiError';

/** MIME types the server accepts (matches DOCUMENT_MIME_TYPES in fileUpload.ts). */
const ACCEPTED_MIME_TYPES = [
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
];

const ACCEPT_STRING = ACCEPTED_MIME_TYPES.join(',');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 20;

type ItemType = 'pdf' | 'download';

function mimeToItemType(mime: string): ItemType {
  if (mime === 'application/pdf') return 'pdf';
  return 'download';
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'failed';

interface QueuedFile {
  id: string;
  file: File;
  itemType: ItemType;
  status: FileStatus;
  error?: string;
  documentId?: string;
}

function pickCategory(categories: string[]): string {
  const preferred = ['Reference Materials', 'Lecture Notes', 'Course Materials', 'Tutorials', 'Study Guides', 'Other'];
  for (const p of preferred) {
    if (categories.includes(p)) return p;
  }
  return categories[0] ?? 'Other';
}

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  weeks: Array<{ tempId: string; title: string; sections: Array<{ tempId: string; title: string }> }>;
  courseTitle: string;
  courseId: string | null;
  docCategories: string[];
  onFilesUploaded: (
    items: Array<{ documentId: string; title: string; type: ItemType; fileName: string }>,
    weekTempId: string,
    sectionTempId: string,
  ) => void;
}

export default function BulkUploadModal({
  open,
  onClose,
  weeks,
  courseTitle,
  courseId,
  docCategories,
  onFilesUploaded,
}: BulkUploadModalProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [weekTempId, setWeekTempId] = useState('');
  const [sectionTempId, setSectionTempId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when opened
  const resetState = useCallback(() => {
    setQueue([]);
    setWeekTempId(weeks[0]?.tempId ?? '');
    setSectionTempId(weeks[0]?.sections[0]?.tempId ?? '');
    setUploading(false);
    setDragOver(false);
  }, [weeks]);

  // Sync default week/section when weeks change or modal opens
  React.useEffect(() => {
    if (open) resetState();
  }, [open, resetState]);

  // Update section when week changes
  const handleWeekChange = (wId: string) => {
    setWeekTempId(wId);
    const w = weeks.find((w) => w.tempId === wId);
    setSectionTempId(w?.sections[0]?.tempId ?? '');
  };

  const selectedWeek = weeks.find((w) => w.tempId === weekTempId);
  const sections = selectedWeek?.sections ?? [];

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const errors: string[] = [];
    const valid: QueuedFile[] = [];

    for (const f of arr) {
      if (queue.length + valid.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} files per batch. "${f.name}" skipped.`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        errors.push(`"${f.name}" exceeds 10 MB limit.`);
        continue;
      }
      if (!ACCEPTED_MIME_TYPES.includes(f.type)) {
        errors.push(`"${f.name}" has unsupported type (${f.type || 'unknown'}).`);
        continue;
      }
      valid.push({
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        itemType: mimeToItemType(f.type),
        status: 'pending',
      });
    }

    if (errors.length > 0) {
      alert(errors.join('\n'));
    }
    if (valid.length > 0) {
      setQueue((prev) => [...prev, ...valid]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((f) => f.id !== id));
  };

  const startUpload = async () => {
    if (!weekTempId || !sectionTempId) {
      alert('Please select a week and section first.');
      return;
    }
    const pending = queue.filter((f) => f.status === 'pending' || f.status === 'failed');
    if (pending.length === 0) return;

    setUploading(true);
    const category = pickCategory(docCategories);
    const uploaded: Array<{ documentId: string; title: string; type: ItemType; fileName: string }> = [];

    for (const qf of pending) {
      // Mark uploading
      setQueue((prev) => prev.map((f) => (f.id === qf.id ? { ...f, status: 'uploading' as FileStatus, error: undefined } : f)));

      try {
        const title = qf.file.name.replace(/\.[^.]+$/, '');
        const created = await documentsService.create({
          title,
          description: `Bulk upload for "${courseTitle.trim() || 'course'}".`,
          category,
          file: qf.file,
          courseIds: courseId ? [courseId] : undefined,
        });
        setQueue((prev) =>
          prev.map((f) => (f.id === qf.id ? { ...f, status: 'done' as FileStatus, documentId: created.id } : f)),
        );
        uploaded.push({ documentId: created.id, title, type: qf.itemType, fileName: qf.file.name });
      } catch (err) {
        setQueue((prev) =>
          prev.map((f) =>
            f.id === qf.id ? { ...f, status: 'failed' as FileStatus, error: getErrorMessage(err, 'Upload failed') } : f,
          ),
        );
      }
    }

    setUploading(false);

    if (uploaded.length > 0) {
      onFilesUploaded(uploaded, weekTempId, sectionTempId);
    }
  };

  const retryFile = async (fileId: string) => {
    const qf = queue.find((f) => f.id === fileId);
    if (!qf || qf.status !== 'failed') return;

    setQueue((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: 'uploading' as FileStatus, error: undefined } : f)));
    const category = pickCategory(docCategories);

    try {
      const title = qf.file.name.replace(/\.[^.]+$/, '');
      const created = await documentsService.create({
        title,
        description: `Bulk upload for "${courseTitle.trim() || 'course'}".`,
        category,
        file: qf.file,
        courseIds: courseId ? [courseId] : undefined,
      });
      setQueue((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, status: 'done' as FileStatus, documentId: created.id } : f)),
      );
      onFilesUploaded([{ documentId: created.id, title, type: qf.itemType, fileName: qf.file.name }], weekTempId, sectionTempId);
    } catch (err) {
      setQueue((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: 'failed' as FileStatus, error: getErrorMessage(err, 'Upload failed') } : f,
        ),
      );
    }
  };

  if (!open) return null;

  const doneCount = queue.filter((f) => f.status === 'done').length;
  const failedCount = queue.filter((f) => f.status === 'failed').length;
  const totalCount = queue.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Bulk upload files"
      data-testid="bulk-upload-modal"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b">
          <h2 className="text-lg font-semibold text-neutral-800">Bulk Upload Files</h2>
          <button onClick={onClose} disabled={uploading} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Week & Section selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Week</label>
              <select
                value={weekTempId}
                onChange={(e) => handleWeekChange(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                data-testid="bulk-upload-week-select"
              >
                {weeks.map((w) => (
                  <option key={w.tempId} value={w.tempId}>{w.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Section</label>
              <select
                value={sectionTempId}
                onChange={(e) => setSectionTempId(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                data-testid="bulk-upload-section-select"
              >
                {sections.map((s) => (
                  <option key={s.tempId} value={s.tempId}>{s.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-accent-teal bg-accent-teal/5' : 'border-neutral-300 hover:border-neutral-400'
            }`}
            data-testid="bulk-upload-dropzone"
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-neutral-400" />
            <p className="text-sm text-neutral-600">Drag files here or click to browse</p>
            <p className="text-xs text-neutral-400 mt-1">PDF, images, Office docs, ZIP — max 10 MB each, up to 20 files</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_STRING}
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
              data-testid="bulk-upload-file-input"
            />
          </div>

          {/* Note about video/audio */}
          <p className="text-xs text-neutral-500">
            Video and audio items cannot be bulk-uploaded (they require URLs). Use "Add Item" in the editor for those.
          </p>

          {/* File list */}
          {queue.length > 0 && (
            <div className="space-y-2" data-testid="bulk-upload-file-list">
              {queue.map((qf) => (
                <div key={qf.id} className="flex items-center gap-2 p-2 rounded-lg bg-neutral-50 text-sm">
                  {qf.status === 'pending' && <div className="h-4 w-4 rounded-full bg-neutral-300" />}
                  {qf.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-accent-teal" />}
                  {qf.status === 'done' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {qf.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-500" />}
                  <span className="flex-1 truncate">{qf.file.name}</span>
                  <span className="text-xs text-neutral-400">{qf.itemType}</span>
                  {qf.status === 'failed' && (
                    <button
                      onClick={() => void retryFile(qf.id)}
                      className="text-accent-teal hover:text-accent-teal/80"
                      title="Retry"
                      data-testid={`bulk-upload-retry-${qf.id}`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                  {(qf.status === 'pending' || qf.status === 'failed') && !uploading && (
                    <button onClick={() => removeFile(qf.id)} className="text-neutral-400 hover:text-red-500" title="Remove">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {/* Progress summary */}
              {totalCount > 0 && (
                <div className="text-xs text-neutral-500 text-right" data-testid="bulk-upload-progress">
                  {doneCount}/{totalCount} uploaded{failedCount > 0 ? ` · ${failedCount} failed` : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            {doneCount > 0 && failedCount === 0 ? 'Done' : 'Cancel'}
          </Button>
          {queue.some((f) => f.status === 'pending' || f.status === 'failed') && (
            <Button onClick={() => void startUpload()} disabled={uploading || !weekTempId || !sectionTempId}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Upload {queue.filter((f) => f.status === 'pending' || f.status === 'failed').length} files
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add LMS-Frontend/src/components/BulkUploadModal.tsx
git commit -m "feat: add BulkUploadModal component with drag-and-drop, progress, and retry"
```

---

### Task 4: Integrate BulkUploadModal into AdminCourse

**Files:**
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx`

**Interfaces:**
- Consumes: `BulkUploadModal` component (from Task 3) with props `{ open, onClose, weeks, courseTitle, courseId, docCategories, onFilesUploaded }`
- Produces: "Bulk Upload" button in course editor toolbar; `onFilesUploaded` callback that creates `ItemDraft` entries and appends them to the selected section in `weeks` state.

- [ ] **Step 1: Add import for BulkUploadModal**

In `LMS-Frontend/src/pages/AdminCourse.tsx`, add after the existing imports (after line 32):

```typescript
import BulkUploadModal from '../components/BulkUploadModal';
```

- [ ] **Step 2: Add bulk upload state**

In `LMS-Frontend/src/pages/AdminCourse.tsx`, after `const csvInputRef = useRef<HTMLInputElement>(null);` (line 302), add:

```typescript
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
```

- [ ] **Step 3: Add onFilesUploaded handler**

In `LMS-Frontend/src/pages/AdminCourse.tsx`, after the `handlePdfUploadForItem` function (after line 438), add:

```typescript
  const handleBulkFilesUploaded = (
    items: Array<{ documentId: string; title: string; type: 'pdf' | 'download'; fileName: string }>,
    weekTempId: string,
    sectionTempId: string,
  ) => {
    setWeeks((prev) =>
      prev.map((w) => {
        if (w.tempId !== weekTempId) return w;
        return {
          ...w,
          sections: w.sections.map((s) => {
            if (s.tempId !== sectionTempId) return s;
            const maxOrder = s.items.reduce((max, it) => Math.max(max, it.order), 0);
            const newItems: ItemDraft[] = items.map((item, i) => ({
              tempId: newTempId(),
              type: item.type,
              title: item.title,
              order: maxOrder + 1 + i,
              documentId: item.documentId,
              fileName: item.fileName,
            }));
            return { ...s, items: [...s.items, ...newItems] };
          }),
        };
      }),
    );
    refreshDocumentsList();
  };
```

- [ ] **Step 4: Add "Bulk Upload" button to toolbar**

In `LMS-Frontend/src/pages/AdminCourse.tsx`, in the course editor toolbar (after the "Import CSV" button, around line 895), add:

After the existing Import CSV button block:
```tsx
                <Button variant="outline" size="sm" onClick={() => { setImportOpen(true); setImportParsed(null); setImportErrors([]); setImportFileName(''); }}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Import CSV
                </Button>
```

Add:
```tsx
                {editingId && weeks.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setBulkUploadOpen(true)}>
                    <Upload className="h-4 w-4 mr-1" />
                    Bulk Upload
                  </Button>
                )}
```

Note: `Upload` is already imported from lucide-react (line 16).

- [ ] **Step 5: Render BulkUploadModal**

In `LMS-Frontend/src/pages/AdminCourse.tsx`, just before the final closing `</>` of the component return (before the last `</>`), add:

```tsx
      <BulkUploadModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        weeks={weeks}
        courseTitle={courseTitle}
        courseId={editingId}
        docCategories={docCategories}
        onFilesUploaded={handleBulkFilesUploaded}
      />
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add LMS-Frontend/src/pages/AdminCourse.tsx
git commit -m "feat: integrate BulkUploadModal into course editor toolbar"
```

---

### Task 5: Frontend Tests — BulkUploadModal

**Files:**
- Create: `LMS-Frontend/src/__tests__/components/BulkUploadModal.test.tsx`

**Interfaces:**
- Consumes: `BulkUploadModal` component (from Task 3), `documentsService` (mocked), `useAuth` (mocked)
- Produces: 4 passing FE tests (BULK-UP-FE-1–4). No exports consumed by other tasks.

- [ ] **Step 1: Write the 4 frontend tests**

Create `LMS-Frontend/src/__tests__/components/BulkUploadModal.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/documentsService', () => ({
  documentsService: {
    create: vi.fn(),
  },
}));

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: { role: 'admin', name: 'Admin' } }),
}));

import { documentsService } from '../../services/documentsService';
import BulkUploadModal from '../../components/BulkUploadModal';

const mockCreate = documentsService.create as ReturnType<typeof vi.fn>;

const WEEKS = [
  {
    tempId: 'w1',
    title: 'Week 1',
    sections: [
      { tempId: 's1', title: 'Introduction' },
      { tempId: 's2', title: 'Deep Dive' },
    ],
  },
  {
    tempId: 'w2',
    title: 'Week 2',
    sections: [{ tempId: 's3', title: 'Review' }],
  },
];

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  weeks: WEEKS,
  courseTitle: 'Test Course',
  courseId: 'course-123',
  docCategories: ['Course Materials', 'Lecture Notes'],
  onFilesUploaded: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

const renderModal = (overrides = {}) =>
  render(
    <MemoryRouter>
      <BulkUploadModal {...defaultProps} {...overrides} />
    </MemoryRouter>,
  );

describe('BULK-UP-FE-1: BulkUploadModal renders with drop zone and section selector', () => {
  it('shows drop zone, week selector, and section selector when open', () => {
    renderModal();

    expect(screen.getByTestId('bulk-upload-modal')).toBeDefined();
    expect(screen.getByTestId('bulk-upload-dropzone')).toBeDefined();
    expect(screen.getByTestId('bulk-upload-week-select')).toBeDefined();
    expect(screen.getByTestId('bulk-upload-section-select')).toBeDefined();
  });
});

describe('BULK-UP-FE-2: BulkUploadModal shows file list after file selection', () => {
  it('lists files with detected types after input change', async () => {
    renderModal();

    const input = screen.getByTestId('bulk-upload-file-input') as HTMLInputElement;

    const pdfFile = new File(['%PDF-1.4'], 'lecture.pdf', { type: 'application/pdf' });
    const imgFile = new File(['PNG'], 'diagram.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [pdfFile, imgFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('bulk-upload-file-list')).toBeDefined();
      expect(screen.getByText('lecture.pdf')).toBeDefined();
      expect(screen.getByText('diagram.png')).toBeDefined();
    });
  });
});

describe('BULK-UP-FE-3: BulkUploadModal shows progress during upload', () => {
  it('displays progress counter during upload', async () => {
    // Make create resolve after a tick
    mockCreate.mockResolvedValue({ id: 'doc-1', title: 'lecture' });

    renderModal();

    const input = screen.getByTestId('bulk-upload-file-input') as HTMLInputElement;
    const pdfFile = new File(['%PDF-1.4'], 'lecture.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText('lecture.pdf')).toBeDefined();
    });

    // Click upload button
    const uploadBtn = screen.getByText(/Upload 1 file/i);
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByTestId('bulk-upload-progress')).toBeDefined();
    });
  });
});

describe('BULK-UP-FE-4: BulkUploadModal shows retry button on upload failure', () => {
  it('shows retry button when upload fails', async () => {
    mockCreate.mockRejectedValue(new Error('Network error'));

    renderModal();

    const input = screen.getByTestId('bulk-upload-file-input') as HTMLInputElement;
    const pdfFile = new File(['%PDF-1.4'], 'failed.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText('failed.pdf')).toBeDefined();
    });

    const uploadBtn = screen.getByText(/Upload 1 file/i);
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      // The retry button has a RotateCcw icon with a data-testid
      const retryButtons = screen.getAllByTitle('Retry');
      expect(retryButtons.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run the frontend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/components/BulkUploadModal.test.tsx
```

Expected: 4/4 PASS

- [ ] **Step 3: Run full frontend suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```

Expected: 162/162 PASS (158 + 4)

- [ ] **Step 4: Commit**

```bash
git add LMS-Frontend/src/__tests__/components/BulkUploadModal.test.tsx
git commit -m "test: add 4 FE tests for BulkUploadModal (BULK-UP-FE-1–4)"
```

---

### Task 6: Verification Gates + Merge

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

Expected: 660/660 PASS

- [ ] **Step 3: Full frontend test suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```

Expected: 162/162 PASS

- [ ] **Step 4: Vite build check**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vite build
```

Expected: build succeeds

- [ ] **Step 5: Merge to main**

```bash
git checkout main
git merge --no-ff feat/course-bulk-upload-ui -m "feat: Course Bulk Upload UI — lecturer access + drag-and-drop bulk uploader (Phase 26 C2)"
git tag phase26-c2-complete-2026-08-11
```

- [ ] **Step 6: Write closeout document**

Save to `docs/superpowers/plans/2026-08-11-phase26-c2-closeout.md` with summary, file list, test counts (660 BE + 162 FE = 822), and rollback instructions.
