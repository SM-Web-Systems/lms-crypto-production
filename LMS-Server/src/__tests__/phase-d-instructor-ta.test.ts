import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import './setup.js';
import app from '../app.js';
import { db, execute, queryOne } from '../config/database.js';
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
    const courseId = uuidv4();
    execute(
      "INSERT INTO courses (id, title, description, course_code, sections, approval_status) VALUES (?, 'Draft', 'desc', 'DRAFT-001', '[]', 'draft')",
      [courseId],
    );
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
    execute('INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES (?, ?, ?)', [courseId, ta.userId, instructor.userId]);

    const res = await request(app)
      .get(`/api/v1/ta/courses/${courseId}/submissions`)
      .set('Authorization', `Bearer ${ta.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('D2-TA-3: TA cannot view unassigned course submissions', async () => {
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
