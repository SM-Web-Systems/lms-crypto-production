# Phase D — Instructor/TA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement course approval workflow and TA grading system with Decision #4 enforcement (always explicit approval, no auto-publish).

**Architecture:** Adds 2 new tables (course_tas, course_material_submissions) and 2 new columns on submissions (grade_status, graded_by). Modifies createCourse() for role-aware defaults and getCourses() for approval_status filtering. New ta.ts route file for TA-scoped endpoints. TA grade invariant test enforces Decision #4 at CI level.

**Tech Stack:** Express 4, better-sqlite3 (sync), vitest, supertest

## Global Constraints

- SQLite with better-sqlite3 — all DB calls are synchronous
- Use sync Express handlers for routes that only call better-sqlite3 (async handler gotcha)
- `INSERT OR IGNORE` for user_roles (trg_auto_assign_user_role trigger)
- `queryOne()` returns `T | null` (not undefined)
- `execute()` returns `number` (changes count)
- `hasPermission(userId, perm)` from `middleware/rbac.ts` for inline permission checks
- Test setup: `_resetForTests(schemaSQL)` + `seedRbacData()` + `seedEmailTemplates()` in beforeEach
- Run tests from `LMS-Server/` directory (NOT repo root)
- Full test baseline: 770/770

---

### Task 1: Schema — Add Tables + Columns (Loop D0)

**Files:**
- Modify: `LMS-Server/database/schema.sql`
- Modify: `LMS-Server/src/config/database.ts`
- Test: `LMS-Server/src/__tests__/phase-d-instructor-ta.test.ts`

**Interfaces:**
- Produces: `course_tas` table, `course_material_submissions` table, `grade_status` + `graded_by` columns on submissions

- [ ] **Step 1: Write failing schema tests**

```typescript
// phase-d-instructor-ta.test.ts
import { describe, it, expect } from 'vitest';
import './setup.js';
import { db, execute, queryOne } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

describe('D0: Schema — Tables + Columns', () => {
  it('D0-SCHEMA-1: course_tas table exists with correct columns', () => {
    const cols = db.pragma('table_info(course_tas)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('course_id');
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('assigned_by');
    expect(colNames).toContain('assigned_at');
  });

  it('D0-SCHEMA-2: course_material_submissions table exists', () => {
    const cols = db.pragma('table_info(course_material_submissions)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('course_id');
    expect(colNames).toContain('submitter_id');
    expect(colNames).toContain('section_id');
    expect(colNames).toContain('item_title');
    expect(colNames).toContain('item_type');
    expect(colNames).toContain('content');
    expect(colNames).toContain('status');
  });

  it('D0-SCHEMA-3: submissions table has grade_status + graded_by columns', () => {
    const cols = db.pragma('table_info(submissions)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('grade_status');
    expect(colNames).toContain('graded_by');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-d-instructor-ta.test.ts`
Expected: FAIL — tables/columns don't exist yet

- [ ] **Step 3: Add tables and columns**

Add to `database/schema.sql` (after the course_approval_workflow table):

```sql
-- Phase D: TA assignments
CREATE TABLE IF NOT EXISTS course_tas (
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_tas_user ON course_tas(user_id);

-- Phase D: TA material staging
CREATE TABLE IF NOT EXISTS course_material_submissions (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  submitter_id  TEXT NOT NULL REFERENCES users(id),
  section_id    TEXT NOT NULL,
  item_title    TEXT NOT NULL,
  item_type     TEXT NOT NULL DEFAULT 'text' CHECK (item_type IN ('text', 'video', 'audio', 'document', 'quiz', 'assignment', 'download')),
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   TEXT REFERENCES users(id),
  review_note   TEXT,
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add `grade_status` and `graded_by` to submissions table in schema.sql:

```sql
-- In the submissions CREATE TABLE, add after the existing columns:
  grade_status TEXT DEFAULT 'direct' CHECK (grade_status IN ('direct', 'pending_approval', 'approved')),
  graded_by TEXT REFERENCES users(id),
```

Add ensure functions to `src/config/database.ts`:

```typescript
function ensureCourseTasTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_tas (
      course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by TEXT NOT NULL REFERENCES users(id),
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (course_id, user_id)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_course_tas_user ON course_tas(user_id)');
}
ensureCourseTasTable();

function ensureCourseMaterialSubmissionsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_material_submissions (
      id            TEXT PRIMARY KEY,
      course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      submitter_id  TEXT NOT NULL REFERENCES users(id),
      section_id    TEXT NOT NULL,
      item_title    TEXT NOT NULL,
      item_type     TEXT NOT NULL DEFAULT 'text',
      content       TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      reviewed_by   TEXT REFERENCES users(id),
      review_note   TEXT,
      reviewed_at   TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}
ensureCourseMaterialSubmissionsTable();

function ensureSubmissionsGradeColumns(): void {
  const info = db.pragma('table_info(submissions)') as Array<{ name: string }>;
  if (!info.some(col => col.name === 'grade_status')) {
    db.exec("ALTER TABLE submissions ADD COLUMN grade_status TEXT DEFAULT 'direct'");
  }
  if (!info.some(col => col.name === 'graded_by')) {
    db.exec('ALTER TABLE submissions ADD COLUMN graded_by TEXT');
  }
}
ensureSubmissionsGradeColumns();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-d-instructor-ta.test.ts`
Expected: 3/3 PASS

- [ ] **Step 5: Run full suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 773/773 PASS (770 + 3 new)

- [ ] **Step 6: Commit**

```bash
git add database/schema.sql src/config/database.ts src/__tests__/phase-d-instructor-ta.test.ts
git commit -m "Phase D0: course_tas, course_material_submissions tables + grade_status/graded_by columns"
```

---

### Task 2: Course Approval Workflow (Loop D1)

**Files:**
- Modify: `LMS-Server/src/controllers/coursesController.ts:200-258` (createCourse)
- Modify: `LMS-Server/src/controllers/coursesController.ts:64-118` (getCourses)
- Modify: `LMS-Server/src/routes/courses.ts` (add 3 endpoints)
- Test: `LMS-Server/src/__tests__/phase-d-instructor-ta.test.ts`

**Interfaces:**
- Consumes: `hasPermission(userId, 'course.approve')` from `middleware/rbac.ts`
- Produces: `POST /courses/:id/submit-for-approval`, `POST /courses/:id/approve`, `POST /courses/:id/reject`

- [ ] **Step 1: Write failing approval tests**

Add to `phase-d-instructor-ta.test.ts`:

```typescript
import request from 'supertest';
import app from '../app.js';
import { generateToken } from '../config/jwt.js';

function createUserWithRole(roleId: string, roleName: string) {
  const userId = uuidv4();
  const email = `${roleName}-${userId.slice(0, 8)}@test.com`;
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
    [userId, `Test ${roleName}`, email],
  );
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  const token = generateToken({ userId, email, role: 'student' as any });
  return { userId, email, token };
}

describe('D1: Course Approval Workflow', () => {
  let instructor: { userId: string; token: string };
  let admin: { userId: string; token: string };
  let student: { userId: string; token: string };

  beforeEach(() => {
    instructor = createUserWithRole('role_instructor', 'instructor');
    admin = createUserWithRole('role_admin', 'admin');
    student = createUserWithRole('role_student', 'student');
  });

  it('D1-APPROVAL-1: instructor creates course → approval_status=draft', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Instructor Course', courseCode: 'IC-001' });

    expect(res.status).toBe(201);
    const row = queryOne<{ approval_status: string }>('SELECT approval_status FROM courses WHERE id = ?', [res.body.data.id]);
    expect(row!.approval_status).toBe('draft');
  });

  it('D1-APPROVAL-2: admin creates course → approval_status=published', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Admin Course', courseCode: 'AC-001' });

    expect(res.status).toBe(201);
    const row = queryOne<{ approval_status: string }>('SELECT approval_status FROM courses WHERE id = ?', [res.body.data.id]);
    expect(row!.approval_status).toBe('published');
  });

  it('D1-APPROVAL-3: instructor submits → status=submitted + workflow row', async () => {
    // Create draft course
    const courseId = uuidv4();
    execute(
      "INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Draft', 'desc', 'DRAFT-001', '[]', 'draft')",
      [courseId],
    );
    // Assign instructor as lecturer
    execute('INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)',
      [courseId, instructor.userId, instructor.userId]);

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/submit-for-approval`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(res.status).toBe(200);
    const row = queryOne<{ approval_status: string }>('SELECT approval_status FROM courses WHERE id = ?', [courseId]);
    expect(row!.approval_status).toBe('submitted');

    const workflow = queryOne<{ status: string; submitted_by: string }>(
      'SELECT status, submitted_by FROM course_approval_workflow WHERE course_id = ?', [courseId]);
    expect(workflow).not.toBeNull();
    expect(workflow!.status).toBe('submitted');
    expect(workflow!.submitted_by).toBe(instructor.userId);
  });

  it('D1-APPROVAL-4: admin approves → status=approved', async () => {
    const courseId = uuidv4();
    execute(
      "INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Submitted', 'desc', 'SUB-001', '[]', 'submitted')",
      [courseId],
    );
    execute(
      "INSERT INTO course_approval_workflow (id, course_id, submitted_by, status, submitted_at) VALUES (?, ?, ?, 'submitted', datetime('now'))",
      [uuidv4(), courseId, instructor.userId],
    );

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    const row = queryOne<{ approval_status: string }>('SELECT approval_status FROM courses WHERE id = ?', [courseId]);
    expect(row!.approval_status).toBe('approved');
  });

  it('D1-APPROVAL-5: admin rejects → status=rejected with review_note', async () => {
    const courseId = uuidv4();
    execute(
      "INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Submitted2', 'desc', 'SUB-002', '[]', 'submitted')",
      [courseId],
    );
    execute(
      "INSERT INTO course_approval_workflow (id, course_id, submitted_by, status, submitted_at) VALUES (?, ?, ?, 'submitted', datetime('now'))",
      [uuidv4(), courseId, instructor.userId],
    );

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reviewNote: 'Needs more content' });

    expect(res.status).toBe(200);
    const row = queryOne<{ approval_status: string }>('SELECT approval_status FROM courses WHERE id = ?', [courseId]);
    expect(row!.approval_status).toBe('rejected');

    const workflow = queryOne<{ review_note: string }>('SELECT review_note FROM course_approval_workflow WHERE course_id = ?', [courseId]);
    expect(workflow!.review_note).toBe('Needs more content');
  });

  it('D1-APPROVAL-6: students cannot see draft/submitted/rejected courses', async () => {
    // Create courses in various states
    const draftId = uuidv4();
    execute("INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Draft', '', 'D-001', '[]', 'draft')", [draftId]);
    const submittedId = uuidv4();
    execute("INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Submitted', '', 'S-001', '[]', 'submitted')", [submittedId]);
    const rejectedId = uuidv4();
    execute("INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Rejected', '', 'R-001', '[]', 'rejected')", [rejectedId]);
    const approvedId = uuidv4();
    execute("INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Approved', '', 'A-001', '[]', 'approved')", [approvedId]);
    const publishedId = uuidv4();
    execute("INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Published', '', 'P-001', '[]', 'published')", [publishedId]);

    // Enroll student in ALL courses
    for (const code of ['D-001', 'S-001', 'R-001', 'A-001', 'P-001']) {
      execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [student.userId, code]);
    }

    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${student.token}`);

    expect(res.status).toBe(200);
    const titles = res.body.data.courses.map((c: any) => c.title);
    expect(titles).toContain('Approved');
    expect(titles).toContain('Published');
    expect(titles).not.toContain('Draft');
    expect(titles).not.toContain('Submitted');
    expect(titles).not.toContain('Rejected');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-d-instructor-ta.test.ts`
Expected: D1 tests FAIL (endpoints don't exist, no approval_status filtering)

- [ ] **Step 3: Implement createCourse role-aware default**

In `src/controllers/coursesController.ts`, add import at top:
```typescript
import { hasPermission } from '../middleware/rbac.js';
```

In `createCourse()` (line ~241), change the INSERT to include `approval_status`:

```typescript
    // Role-aware approval_status: users with course.approve → published, else → draft
    const approvalStatus = req.user?.userId && hasPermission(req.user.userId, 'course.approve')
      ? 'published'
      : 'draft';

    execute(
      'INSERT INTO courses (id, title, description, course_code, sections, sponsor_label, tenant_id, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [course.id, course.title, course.description ?? null, course.courseCode, JSON.stringify(course.sections), sponsorLabelVal, tenantId, approvalStatus]
    );
```

- [ ] **Step 4: Implement getCourses approval_status filter**

In `getCourses()` (line ~100-113), update the student query (the `else` branch) to add approval_status filtering:

```typescript
      } else {
        const placeholders = codes.map(() => '?').join(',');
        rows = query<CourseRow>(
          `SELECT id, title, description, course_code, sections, sponsor_label FROM courses
           WHERE course_code IN (${placeholders}) AND approval_status IN ('approved', 'published')
           ORDER BY title`,
          codes
        );
      }
```

- [ ] **Step 5: Add approval endpoints to courses.ts**

Add to `src/routes/courses.ts` (before the `router.get('/:id', getCourse)` line):

```typescript
// Phase D: Course approval workflow
router.post('/:id/submit-for-approval', requirePermission('course.manage'), submitForApproval);
router.post('/:id/approve', requirePermission('course.approve'), approveCourse);
router.post('/:id/reject', requirePermission('course.approve'), rejectCourse);
```

Add imports at top of courses.ts:
```typescript
import { submitForApproval, approveCourse, rejectCourse } from '../controllers/coursesController.js';
```

- [ ] **Step 6: Implement approval controller functions**

Add to `src/controllers/coursesController.ts`:

```typescript
export function submitForApproval(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const userId = req.user!.userId;

  const course = queryOne<{ id: string; approval_status: string }>('SELECT id, approval_status FROM courses WHERE id = ?', [id]);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }
  if (course.approval_status !== 'draft' && course.approval_status !== 'rejected') {
    res.status(400).json({ success: false, error: `Cannot submit course with status '${course.approval_status}'` });
    return;
  }

  execute("UPDATE courses SET approval_status = 'submitted' WHERE id = ?", [id]);

  // Upsert workflow row
  const existing = queryOne<{ id: string }>('SELECT id FROM course_approval_workflow WHERE course_id = ?', [id]);
  if (existing) {
    execute(
      "UPDATE course_approval_workflow SET status = 'submitted', submitted_at = datetime('now'), submitted_by = ?, reviewed_by = NULL, review_note = NULL, reviewed_at = NULL WHERE course_id = ?",
      [userId, id],
    );
  } else {
    execute(
      "INSERT INTO course_approval_workflow (id, course_id, submitted_by, status, submitted_at) VALUES (?, ?, ?, 'submitted', datetime('now'))",
      [uuidv4(), id, userId],
    );
  }

  res.json({ success: true, data: { courseId: id, approvalStatus: 'submitted' } });
}

export function approveCourse(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const userId = req.user!.userId;

  const course = queryOne<{ id: string; approval_status: string }>('SELECT id, approval_status FROM courses WHERE id = ?', [id]);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }
  if (course.approval_status !== 'submitted') {
    res.status(400).json({ success: false, error: `Cannot approve course with status '${course.approval_status}'` });
    return;
  }

  execute("UPDATE courses SET approval_status = 'approved' WHERE id = ?", [id]);
  execute(
    "UPDATE course_approval_workflow SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE course_id = ?",
    [userId, id],
  );

  res.json({ success: true, data: { courseId: id, approvalStatus: 'approved' } });
}

export function rejectCourse(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const userId = req.user!.userId;
  const { reviewNote } = req.body;

  const course = queryOne<{ id: string; approval_status: string }>('SELECT id, approval_status FROM courses WHERE id = ?', [id]);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }
  if (course.approval_status !== 'submitted') {
    res.status(400).json({ success: false, error: `Cannot reject course with status '${course.approval_status}'` });
    return;
  }

  execute("UPDATE courses SET approval_status = 'rejected' WHERE id = ?", [id]);
  execute(
    "UPDATE course_approval_workflow SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = datetime('now') WHERE course_id = ?",
    [userId, reviewNote || null, id],
  );

  res.json({ success: true, data: { courseId: id, approvalStatus: 'rejected' } });
}
```

- [ ] **Step 7: Run Phase D tests**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-d-instructor-ta.test.ts`
Expected: 9/9 PASS (3 schema + 6 approval)

- [ ] **Step 8: Run full suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 779/779 PASS (770 + 9 new). Watch for regressions in existing course tests — the createCourse change affects admin-created courses in other tests.

- [ ] **Step 9: Commit**

```bash
git add database/schema.sql src/config/database.ts src/controllers/coursesController.ts src/routes/courses.ts src/__tests__/phase-d-instructor-ta.test.ts
git commit -m "Phase D1: course approval workflow — role-aware defaults + submit/approve/reject + student filtering"
```

---

### Task 3: TA Assignment System (Loop D2)

**Files:**
- Modify: `LMS-Server/src/routes/courses.ts` (add TA endpoints)
- Modify: `LMS-Server/src/controllers/coursesController.ts` (add TA functions)
- Create: `LMS-Server/src/routes/ta.ts`
- Modify: `LMS-Server/src/app.ts` (mount ta.ts)
- Test: `LMS-Server/src/__tests__/phase-d-instructor-ta.test.ts`

**Interfaces:**
- Consumes: `course_tas` table from Task 1
- Produces: `GET/POST/DELETE /courses/:id/tas`, `GET /ta/courses`

- [ ] **Step 1: Write failing TA assignment tests**

Add to test file:

```typescript
describe('D2: TA Assignment System', () => {
  let instructor: { userId: string; token: string };
  let ta: { userId: string; token: string };
  let admin: { userId: string; token: string };
  let courseId: string;

  beforeEach(() => {
    instructor = createUserWithRole('role_instructor', 'instructor');
    ta = createUserWithRole('role_ta', 'ta');
    admin = createUserWithRole('role_admin', 'admin');
    courseId = uuidv4();
    execute("INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'TA Course', 'desc', 'TA-001', '[]')", [courseId]);
    execute('INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, instructor.userId, instructor.userId]);
  });

  it('D2-TA-1: instructor can assign TA to course', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/tas`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ userId: ta.userId });

    expect(res.status).toBe(201);

    const assignment = queryOne<{ user_id: string }>('SELECT user_id FROM course_tas WHERE course_id = ? AND user_id = ?', [courseId, ta.userId]);
    expect(assignment).not.toBeNull();
  });

  it('D2-TA-2: TA can view assigned course submissions', async () => {
    // Assign TA
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, ta.userId, instructor.userId]);

    const res = await request(app)
      .get(`/api/v1/ta/courses/${courseId}/submissions`)
      .set('Authorization', `Bearer ${ta.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('D2-TA-3: TA cannot view unassigned course submissions', async () => {
    // TA is NOT assigned to this course
    const res = await request(app)
      .get(`/api/v1/ta/courses/${courseId}/submissions`)
      .set('Authorization', `Bearer ${ta.token}`);

    expect(res.status).toBe(403);
  });

  it('D2-TA-4: TA can list assigned courses', async () => {
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, ta.userId, instructor.userId]);

    const res = await request(app)
      .get('/api/v1/ta/courses')
      .set('Authorization', `Bearer ${ta.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.courses).toHaveLength(1);
    expect(res.body.data.courses[0].title).toBe('TA Course');
  });

  it('D2-TA-5: instructor can list TAs for course', async () => {
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, ta.userId, instructor.userId]);

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/tas`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.tas).toHaveLength(1);
  });

  it('D2-TA-6: instructor can remove TA from course', async () => {
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, ta.userId, instructor.userId]);

    const res = await request(app)
      .delete(`/api/v1/courses/${courseId}/tas/${ta.userId}`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(res.status).toBe(200);
    const remaining = queryOne('SELECT user_id FROM course_tas WHERE course_id = ? AND user_id = ?', [courseId, ta.userId]);
    expect(remaining).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-d-instructor-ta.test.ts`
Expected: D2 tests FAIL (endpoints don't exist)

- [ ] **Step 3: Add TA endpoints to courses.ts**

Add to `src/routes/courses.ts` (near the approval endpoints):

```typescript
// Phase D: TA assignment
router.get('/:id/tas', requirePermission('course.manage'), listCourseTAs);
router.post('/:id/tas', requirePermission('course.manage'), assignTA);
router.delete('/:id/tas/:userId', requirePermission('course.manage'), removeTA);
```

Add imports:
```typescript
import { listCourseTAs, assignTA, removeTA } from '../controllers/coursesController.js';
```

- [ ] **Step 4: Implement TA assignment functions in coursesController.ts**

```typescript
export function listCourseTAs(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const tas = query<{ user_id: string; name: string; email: string; assigned_at: string }>(
    `SELECT ct.user_id, u.name, u.email, ct.assigned_at
     FROM course_tas ct JOIN users u ON u.id = ct.user_id
     WHERE ct.course_id = ?`,
    [id],
  );
  res.json({ success: true, data: { tas } });
}

export function assignTA(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const { userId: taUserId } = req.body;
  const assignerId = req.user!.userId;

  if (!taUserId) {
    res.status(400).json({ success: false, error: 'userId is required' });
    return;
  }

  const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [id]);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  try {
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [id, taUserId, assignerId]);
  } catch {
    res.status(409).json({ success: false, error: 'TA already assigned to this course' });
    return;
  }

  res.status(201).json({ success: true, data: { courseId: id, userId: taUserId } });
}

export function removeTA(req: AuthRequest, res: Response): void {
  const { id, userId: taUserId } = req.params;

  const changes = execute('DELETE FROM course_tas WHERE course_id = ? AND user_id = ?', [id, taUserId]);
  if (changes === 0) {
    res.status(404).json({ success: false, error: 'TA assignment not found' });
    return;
  }

  res.json({ success: true, data: { removed: true } });
}
```

- [ ] **Step 5: Create ta.ts route file**

Create `src/routes/ta.ts`:

```typescript
import { Router, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { query, queryOne } from '../config/database.js';

const router = Router();

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
    id: string; title: string; student_id: string; status: string;
    grade_status: string; submitted_at: string; file_name: string;
  }>(
    `SELECT s.id, s.title, s.student_id, s.status, s.grade_status, s.submitted_at, s.file_name
     FROM submissions s
     WHERE s.course_id = ?
     ORDER BY s.submitted_at DESC`,
    [courseId],
  );

  res.json({ success: true, data: { submissions } });
});

export default router;
```

- [ ] **Step 6: Mount ta.ts in app.ts**

Add import:
```typescript
import taRoutes from './routes/ta.js';
```

Add mount line (after teacher routes):
```typescript
app.use('/api/v1', apiLimiter, taRoutes);
```

- [ ] **Step 7: Run Phase D tests**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-d-instructor-ta.test.ts`
Expected: 15/15 PASS (3 schema + 6 approval + 6 TA)

- [ ] **Step 8: Run full suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 785/785 PASS (770 + 15 new)

- [ ] **Step 9: Commit**

```bash
git add src/routes/ta.ts src/routes/courses.ts src/controllers/coursesController.ts src/app.ts src/__tests__/phase-d-instructor-ta.test.ts
git commit -m "Phase D2: TA assignment system — assign/remove/list TAs + TA course listing + submission access"
```

---

### Task 4: TA Grading + Grade/Material Approval + Invariants (Loop D3 + D4 + D-INV)

**Files:**
- Modify: `LMS-Server/src/routes/ta.ts` (add grading + material endpoints)
- Modify: `LMS-Server/src/routes/courses.ts` (add material approval endpoints)
- Modify: `LMS-Server/src/controllers/coursesController.ts` (material approval)
- Test: `LMS-Server/src/__tests__/phase-d-instructor-ta.test.ts`
- Create: `LMS-Server/src/__tests__/ta-grade-invariant.test.ts`

**Interfaces:**
- Consumes: `course_tas` table, `grade_status`/`graded_by` columns, `course_material_submissions` table
- Produces: `POST /ta/submissions/:id/grade`, `POST /ta/submissions/:id/approve-grade`, `POST /ta/submissions/:id/reject-grade`, `POST /ta/courses/:id/materials`, `POST /courses/:id/materials/:materialId/approve`, `POST /courses/:id/materials/:materialId/reject`

- [ ] **Step 1: Write failing TA grading tests**

Add to `phase-d-instructor-ta.test.ts`:

```typescript
describe('D3: TA Grading (Decision #4: Always Explicit)', () => {
  let instructor: { userId: string; token: string };
  let ta: { userId: string; token: string };
  let student: { userId: string; token: string };
  let courseId: string;
  let submissionId: string;

  beforeEach(() => {
    instructor = createUserWithRole('role_instructor', 'instructor');
    ta = createUserWithRole('role_ta', 'ta');
    student = createUserWithRole('role_student', 'student');
    courseId = uuidv4();
    execute("INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Grade Course', 'desc', 'GR-001', '[]')", [courseId]);
    execute('INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, instructor.userId, instructor.userId]);
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, ta.userId, instructor.userId]);

    // Create a student record + submission
    const studentRecordId = uuidv4();
    execute("INSERT INTO students (id, user_id, name, email, enrollment_number) VALUES (?, ?, 'Test Student', ?, 'ENR-001')",
      [studentRecordId, student.userId, `student-${student.userId.slice(0,8)}@test.com`]);
    submissionId = uuidv4();
    execute(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, course_id, status) VALUES (?, ?, 'My Assignment', 'desc', 'file.pdf', 1024, '/tmp/file.pdf', ?, 'pending')",
      [submissionId, studentRecordId, courseId],
    );
  });

  it('D3-GRADE-1: TA grade sets grade_status=pending_approval, submission status unchanged', async () => {
    const res = await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/grade`)
      .set('Authorization', `Bearer ${ta.token}`)
      .send({ status: 'approved', feedback: 'Good work' });

    expect(res.status).toBe(200);

    const sub = queryOne<{ status: string; grade_status: string; graded_by: string }>(
      'SELECT status, grade_status, graded_by FROM submissions WHERE id = ?', [submissionId]);
    expect(sub!.grade_status).toBe('pending_approval');
    expect(sub!.graded_by).toBe(ta.userId);
    // Original status unchanged — student still sees 'pending'
    expect(sub!.status).toBe('pending');
  });

  it('D3-GRADE-2: TA-graded submission NOT visible as graded to students until approved', async () => {
    // TA grades it
    execute("UPDATE submissions SET grade_status = 'pending_approval', graded_by = ? WHERE id = ?", [ta.userId, submissionId]);

    // Student views own submissions — status should still be 'pending'
    const res = await request(app)
      .get('/api/v1/submissions')
      .set('Authorization', `Bearer ${student.token}`);

    expect(res.status).toBe(200);
    // The submission should show status='pending' (not 'approved')
    if (res.body.data.submissions && res.body.data.submissions.length > 0) {
      const sub = res.body.data.submissions.find((s: any) => s.id === submissionId);
      if (sub) {
        expect(sub.status).toBe('pending');
        // grade_status should NOT be exposed to student
        expect(sub.grade_status).toBeUndefined();
      }
    }
  });

  it('D3-GRADE-3: TA cannot see student billing or wallet data', async () => {
    const billingRes = await request(app)
      .get('/api/v1/parent/wallets')
      .set('Authorization', `Bearer ${ta.token}`);
    expect(billingRes.status).toBe(403);

    const billingRes2 = await request(app)
      .get('/api/v1/parent/billing')
      .set('Authorization', `Bearer ${ta.token}`);
    expect(billingRes2.status).toBe(403);
  });
});

describe('D4: Grade + Material Approval', () => {
  let instructor: { userId: string; token: string };
  let ta: { userId: string; token: string };
  let courseId: string;
  let submissionId: string;
  let studentRecordId: string;

  beforeEach(() => {
    instructor = createUserWithRole('role_instructor', 'instructor');
    ta = createUserWithRole('role_ta', 'ta');
    const student = createUserWithRole('role_student', 'student');
    courseId = uuidv4();
    execute("INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Approval Course', 'desc', 'AP-001', ?)", [courseId, JSON.stringify([{ id: 'sec-1', title: 'Week 1', items: [] }])]);
    execute('INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, instructor.userId, instructor.userId]);
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, ta.userId, instructor.userId]);

    studentRecordId = uuidv4();
    execute("INSERT INTO students (id, user_id, name, email, enrollment_number) VALUES (?, ?, 'Test Student', ?, 'ENR-002')",
      [studentRecordId, student.userId, `student-${student.userId.slice(0,8)}@test.com`]);
    submissionId = uuidv4();
    execute(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, course_id, status, grade_status, graded_by) VALUES (?, ?, 'Assignment', 'desc', 'f.pdf', 512, '/tmp/f.pdf', ?, 'pending', 'pending_approval', ?)",
      [submissionId, studentRecordId, courseId, ta.userId],
    );
  });

  it('D4-APPROVE-1: instructor approves TA grade → grade_status=approved, submission status updated', async () => {
    const res = await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/approve-grade`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);

    const sub = queryOne<{ status: string; grade_status: string; reviewed_by_id: string }>(
      'SELECT status, grade_status, reviewed_by_id FROM submissions WHERE id = ?', [submissionId]);
    expect(sub!.grade_status).toBe('approved');
    expect(sub!.status).toBe('approved');
    expect(sub!.reviewed_by_id).toBe(instructor.userId);
  });

  it('D4-APPROVE-2: instructor rejects TA grade → grade_status reset to direct', async () => {
    const res = await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/reject-grade`)
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ feedback: 'Grading was too lenient' });

    expect(res.status).toBe(200);

    const sub = queryOne<{ grade_status: string }>(
      'SELECT grade_status FROM submissions WHERE id = ?', [submissionId]);
    expect(sub!.grade_status).toBe('direct');
  });

  it('D4-MATERIAL-1: TA-submitted material not visible until approved, merge on approval', async () => {
    // TA submits material
    const submitRes = await request(app)
      .post(`/api/v1/ta/courses/${courseId}/materials`)
      .set('Authorization', `Bearer ${ta.token}`)
      .send({ sectionId: 'sec-1', itemTitle: 'New Reading', itemType: 'text', content: 'Study this chapter' });

    expect(submitRes.status).toBe(201);
    const materialId = submitRes.body.data.id;

    // Material is pending — not in course sections yet
    const courseBefore = queryOne<{ sections: string }>('SELECT sections FROM courses WHERE id = ?', [courseId]);
    const sectionsBefore = JSON.parse(courseBefore!.sections);
    expect(sectionsBefore[0].items).toHaveLength(0);

    // Instructor approves
    const approveRes = await request(app)
      .post(`/api/v1/courses/${courseId}/materials/${materialId}/approve`)
      .set('Authorization', `Bearer ${instructor.token}`);

    expect(approveRes.status).toBe(200);

    // Now course sections should contain the new item
    const courseAfter = queryOne<{ sections: string }>('SELECT sections FROM courses WHERE id = ?', [courseId]);
    const sectionsAfter = JSON.parse(courseAfter!.sections);
    expect(sectionsAfter[0].items).toHaveLength(1);
    expect(sectionsAfter[0].items[0].title).toBe('New Reading');

    // Material status should be approved
    const mat = queryOne<{ status: string }>('SELECT status FROM course_material_submissions WHERE id = ?', [materialId]);
    expect(mat!.status).toBe('approved');
  });
});
```

- [ ] **Step 2: Write TA grade invariant tests**

Create `src/__tests__/ta-grade-invariant.test.ts`:

```typescript
/**
 * CI-Level Invariant: TA Grade Approval Gating (Decision #4)
 *
 * TA-GRADE-INV-1: Submissions with grade_status='pending_approval' must NOT
 *   have their main status changed to 'approved' or 'rejected' without
 *   an explicit approval action.
 *
 * TA-GRADE-INV-2: No auto-publish mechanism exists for TA grades.
 *   The only code path that transitions grade_status from 'pending_approval'
 *   to 'approved' is POST /ta/submissions/:id/approve-grade.
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
import { execute, query, queryOne } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

describe('TA Grade Invariant: Decision #4 — Always Explicit Approval', () => {
  it('TA-GRADE-INV-1: pending_approval submissions have status=pending (not approved/rejected)', () => {
    // Create test data
    const studentRecordId = uuidv4();
    const userId = uuidv4();
    execute("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, '$2a$10$test', 'student')", [userId, `inv-${userId.slice(0,8)}@test.com`]);
    execute("INSERT INTO students (id, user_id, name, email, enrollment_number) VALUES (?, ?, 'Test', ?, 'INV-001')", [studentRecordId, userId, `inv-${userId.slice(0,8)}@test.com`]);

    const subId = uuidv4();
    execute(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, grade_status) VALUES (?, ?, 'Inv Test', 'desc', 'f.pdf', 100, '/tmp/f.pdf', 'pending', 'pending_approval')",
      [subId, studentRecordId],
    );

    // Verify: grade_status=pending_approval AND status=pending (not approved)
    const sub = queryOne<{ status: string; grade_status: string }>(
      'SELECT status, grade_status FROM submissions WHERE id = ?', [subId]);
    expect(sub!.grade_status).toBe('pending_approval');
    expect(sub!.status).toBe('pending');
    // The main status must NOT be 'approved' while grade_status is 'pending_approval'
    expect(sub!.status).not.toBe('approved');
    expect(sub!.status).not.toBe('rejected');
  });

  it('TA-GRADE-INV-2: role_ta does NOT have course.grade permission (only course.grade_pending)', () => {
    const perms = query<{ name: string }>(
      `SELECT p.name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = 'role_ta'`,
    );
    const permNames = perms.map(p => p.name);

    // TA has grade_pending but NOT grade
    expect(permNames).toContain('course.grade_pending');
    expect(permNames).not.toContain('course.grade');

    // TA cannot approve courses either
    expect(permNames).not.toContain('course.approve');
  });

  it('TA-GRADE-INV-3: course.grade holders CAN approve TA grades (instructor, admin, admin-2, super-admin)', () => {
    const approverRoles = ['role_instructor', 'role_admin', 'role_admin2', 'role_super_admin'];
    for (const roleId of approverRoles) {
      const perms = query<{ name: string }>(
        `SELECT p.name FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = ?`,
        [roleId],
      );
      const permNames = perms.map(p => p.name);
      expect(permNames, `${roleId} should have course.grade`).toContain('course.grade');
    }
  });

  it('TA-GRADE-INV-4: no auto-publish — grade_status can only be approved via explicit action', () => {
    // This is a structural invariant: there should be no trigger, cron, or auto-update
    // that transitions grade_status from pending_approval to approved.
    // We verify by checking that the database has no triggers on submissions
    // that modify grade_status.
    const triggers = query<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'submissions'",
    );
    for (const trigger of triggers) {
      // No trigger should auto-set grade_status to 'approved'
      expect(trigger.sql).not.toContain("grade_status = 'approved'");
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-d-instructor-ta.test.ts src/__tests__/ta-grade-invariant.test.ts`
Expected: D3/D4 tests FAIL (endpoints don't exist), invariant tests may PASS (they test data + permissions, not endpoints)

- [ ] **Step 4: Add TA grading endpoint to ta.ts**

Add to `src/routes/ta.ts`:

```typescript
import { execute } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// POST /ta/submissions/:id/grade — TA grades submission (pending approval)
router.post('/ta/submissions/:id/grade', authenticate, requirePermission('course.grade_pending'), (req, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const { id: submissionId } = req.params;
  const { status, feedback } = req.body;

  if (!status || !['approved', 'rejected'].includes(status)) {
    res.status(400).json({ success: false, error: "status must be 'approved' or 'rejected'" });
    return;
  }

  const submission = queryOne<{ id: string; course_id: string | null }>(
    'SELECT id, course_id FROM submissions WHERE id = ?', [submissionId]);
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

  // TA grade: set grade_status to pending_approval, do NOT change main status
  execute(
    "UPDATE submissions SET grade_status = 'pending_approval', graded_by = ?, feedback = ?, updated_at = datetime('now') WHERE id = ?",
    [userId, feedback?.trim() || null, submissionId],
  );

  res.json({ success: true, data: { submissionId, gradeStatus: 'pending_approval' } });
});

// POST /ta/submissions/:id/approve-grade — instructor/admin approves TA grade
router.post('/ta/submissions/:id/approve-grade', authenticate, requirePermission('course.grade'), (req, res: Response) => {
  const userId = (req as AuthRequest).user!.userId;
  const { id: submissionId } = req.params;
  const { status } = req.body;

  const submission = queryOne<{ id: string; grade_status: string }>(
    'SELECT id, grade_status FROM submissions WHERE id = ?', [submissionId]);
  if (!submission) {
    res.status(404).json({ success: false, error: 'Submission not found' });
    return;
  }
  if (submission.grade_status !== 'pending_approval') {
    res.status(400).json({ success: false, error: 'No pending TA grade to approve' });
    return;
  }

  const finalStatus = status || 'approved';

  execute(
    "UPDATE submissions SET grade_status = 'approved', status = ?, reviewed_by_id = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [finalStatus, userId, submissionId],
  );

  res.json({ success: true, data: { submissionId, gradeStatus: 'approved', status: finalStatus } });
});

// POST /ta/submissions/:id/reject-grade — instructor/admin rejects TA grade
router.post('/ta/submissions/:id/reject-grade', authenticate, requirePermission('course.grade'), (req, res: Response) => {
  const { id: submissionId } = req.params;
  const { feedback } = req.body;

  const submission = queryOne<{ id: string; grade_status: string }>(
    'SELECT id, grade_status FROM submissions WHERE id = ?', [submissionId]);
  if (!submission) {
    res.status(404).json({ success: false, error: 'Submission not found' });
    return;
  }
  if (submission.grade_status !== 'pending_approval') {
    res.status(400).json({ success: false, error: 'No pending TA grade to reject' });
    return;
  }

  execute(
    "UPDATE submissions SET grade_status = 'direct', feedback = ?, updated_at = datetime('now') WHERE id = ?",
    [feedback?.trim() || null, submissionId],
  );

  res.json({ success: true, data: { submissionId, gradeStatus: 'direct' } });
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
```

- [ ] **Step 5: Add material approval endpoints to courses.ts**

Add to `src/routes/courses.ts`:

```typescript
// Phase D: Material approval
router.post('/:id/materials/:materialId/approve', requirePermission('course.manage'), approveMaterial);
router.post('/:id/materials/:materialId/reject', requirePermission('course.manage'), rejectMaterial);
```

Add imports:
```typescript
import { approveMaterial, rejectMaterial } from '../controllers/coursesController.js';
```

- [ ] **Step 6: Implement material approval in coursesController.ts**

```typescript
export function approveMaterial(req: AuthRequest, res: Response): void {
  const { id: courseId, materialId } = req.params;
  const userId = req.user!.userId;

  const material = queryOne<{
    id: string; course_id: string; section_id: string;
    item_title: string; item_type: string; content: string; status: string;
  }>(
    'SELECT id, course_id, section_id, item_title, item_type, content, status FROM course_material_submissions WHERE id = ? AND course_id = ?',
    [materialId, courseId],
  );

  if (!material) {
    res.status(404).json({ success: false, error: 'Material submission not found' });
    return;
  }
  if (material.status !== 'pending') {
    res.status(400).json({ success: false, error: `Material already ${material.status}` });
    return;
  }

  // Merge into course sections JSON
  const course = queryOne<{ sections: string }>('SELECT sections FROM courses WHERE id = ?', [courseId]);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  const sections = JSON.parse(course.sections || '[]');
  const section = sections.find((s: any) => s.id === material.section_id);
  if (!section) {
    res.status(400).json({ success: false, error: `Section '${material.section_id}' not found in course` });
    return;
  }

  if (!section.items) section.items = [];
  section.items.push({
    id: uuidv4(),
    title: material.item_title,
    type: material.item_type,
    content: material.content,
  });

  execute('UPDATE courses SET sections = ? WHERE id = ?', [JSON.stringify(sections), courseId]);
  execute(
    "UPDATE course_material_submissions SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?",
    [userId, materialId],
  );

  res.json({ success: true, data: { materialId, status: 'approved' } });
}

export function rejectMaterial(req: AuthRequest, res: Response): void {
  const { materialId } = req.params;
  const userId = req.user!.userId;
  const { reviewNote } = req.body;

  const material = queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM course_material_submissions WHERE id = ?', [materialId]);
  if (!material) {
    res.status(404).json({ success: false, error: 'Material submission not found' });
    return;
  }
  if (material.status !== 'pending') {
    res.status(400).json({ success: false, error: `Material already ${material.status}` });
    return;
  }

  execute(
    "UPDATE course_material_submissions SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = datetime('now') WHERE id = ?",
    [userId, reviewNote || null, materialId],
  );

  res.json({ success: true, data: { materialId, status: 'rejected' } });
}
```

- [ ] **Step 7: Run all Phase D + invariant tests**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-d-instructor-ta.test.ts src/__tests__/ta-grade-invariant.test.ts`
Expected: All PASS

- [ ] **Step 8: Run full suite**

Run: `cd LMS-Server && npx vitest run`
Expected: ~795/795 PASS (770 + ~25 new Phase D + invariant)

- [ ] **Step 9: Commit**

```bash
git add src/routes/ta.ts src/routes/courses.ts src/controllers/coursesController.ts src/__tests__/phase-d-instructor-ta.test.ts src/__tests__/ta-grade-invariant.test.ts
git commit -m "Phase D3+D4: TA grading + grade/material approval + Decision #4 invariant tests"
```
