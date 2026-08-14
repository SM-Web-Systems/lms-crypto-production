/**
 * Phase C — Parent + Teacher Route Tests (TDD)
 *
 * C1-PARENT-1: Parent can create family group, add linked child, view dashboard
 * C2-CREATE-1: Parent can POST to create + link student account
 * C3-WALLET-1: Parent can GET linked student wallets
 * C3-WALLET-2: Parent CANNOT access unlinked student's wallet
 * C4-HISTORY-1: Parent can view linked child's login history
 * C5-TEACHER-1: Teacher can create class group, invite students
 * C5-TEACHER-2: Teacher CANNOT view student wallets
 * C6-BILLING-1: Teacher + Parent can view own billing
 * C7-ANALYTICS-1: Teacher analytics returns class completion stats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import request from 'supertest';
import app from '../app.js';
import { execute, query, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { v4 as uuidv4 } from 'uuid';

// Helper: create user with RBAC role and return { userId, token }
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

// Helper: create a course
function createCourse(): string {
  const courseId = uuidv4();
  execute(
    "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'Desc', ?)",
    [courseId, `CC-${courseId.slice(0, 8)}`],
  );
  return courseId;
}

// Helper: link parent to child
function linkParentChild(parentId: string, childId: string) {
  execute(
    "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
    [uuidv4(), parentId, childId],
  );
}

describe('Phase C — Parent Routes', () => {
  let parent: { userId: string; email: string; token: string };
  let child: { userId: string; email: string; token: string };
  let unlinkedStudent: { userId: string; email: string; token: string };

  beforeEach(() => {
    parent = createUserWithRole('role_parent', 'parent');
    child = createUserWithRole('role_student', 'child');
    unlinkedStudent = createUserWithRole('role_student', 'unlinked');
    linkParentChild(parent.userId, child.userId);
  });

  it('C1-PARENT-1: Parent dashboard shows linked children count', async () => {
    const res = await request(app)
      .get('/api/v1/parent/dashboard')
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.childrenCount).toBe(1);
    expect(res.body.data.children).toHaveLength(1);
    expect(res.body.data.children[0].id).toBe(child.userId);
  });

  it('C1-PARENT-2: Parent can list linked children', async () => {
    const res = await request(app)
      .get('/api/v1/parent/children')
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.children).toHaveLength(1);
    expect(res.body.data.children[0].id).toBe(child.userId);
  });

  it('C2-CREATE-1: Parent can create + link student account', async () => {
    const res = await request(app)
      .post('/api/v1/parent/children')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        name: 'New Child',
        email: 'newchild@test.com',
        password: 'password123',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('New Child');
    expect(res.body.data.email).toBe('newchild@test.com');

    // Verify link was created
    const link = queryOne(
      "SELECT id FROM user_links WHERE parent_user_id = ? AND child_user_id = ? AND link_type = 'parent'",
      [parent.userId, res.body.data.id],
    );
    expect(link).not.toBeNull();

    // Verify user has student role
    const role = queryOne(
      "SELECT role_id FROM user_roles WHERE user_id = ? AND role_id = 'role_student'",
      [res.body.data.id],
    );
    expect(role).not.toBeNull();
  });

  it('C2-CREATE-2: Parent cannot create child with duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/parent/children')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        name: 'Dup Child',
        email: child.email,
        password: 'password123',
      });

    expect(res.status).toBe(409);
  });

  it('C3-WALLET-1: Parent can GET linked student wallets', async () => {
    const res = await request(app)
      .get('/api/v1/parent/wallets')
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.wallets).toHaveLength(1);
    expect(res.body.data.wallets[0].id).toBe(child.userId);
  });

  it('C3-WALLET-3: Parent wallets include reward_balance_stroops from reward_accounts', async () => {
    // Seed a reward account for the child
    execute(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops) VALUES (?, ?, 'recipient', 7500000)",
      [uuidv4(), child.userId]
    );

    const res = await request(app)
      .get('/api/v1/parent/wallets')
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    const wallet = res.body.data.wallets.find((w: any) => w.id === child.userId);
    expect(wallet).toBeDefined();
    expect(wallet.reward_balance_stroops).toBe(7500000);
  });

  it('C3-WALLET-4: Parent wallets show 0 reward_balance_stroops when no reward account', async () => {
    const res = await request(app)
      .get('/api/v1/parent/wallets')
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    const wallet = res.body.data.wallets.find((w: any) => w.id === child.userId);
    expect(wallet).toBeDefined();
    expect(wallet.reward_balance_stroops).toBe(0);
  });

  it('C3-WALLET-2: Parent wallets do NOT include unlinked students', async () => {
    const res = await request(app)
      .get('/api/v1/parent/wallets')
      .set('Authorization', `Bearer ${parent.token}`);

    const walletIds = res.body.data.wallets.map((w: any) => w.id);
    expect(walletIds).not.toContain(unlinkedStudent.userId);
  });

  it('C4-HISTORY-1: Parent can view linked child\'s login history', async () => {
    // Insert a login record for the child
    execute(
      "INSERT INTO login_history (user_id, ip_address, auth_method) VALUES (?, '127.0.0.1', 'local')",
      [child.userId],
    );

    const res = await request(app)
      .get(`/api/v1/parent/children/${child.userId}/login-history`)
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.history[0].auth_method).toBe('local');
  });

  it('C4-HISTORY-2: Parent CANNOT view unlinked child\'s login history', async () => {
    const res = await request(app)
      .get(`/api/v1/parent/children/${unlinkedStudent.userId}/login-history`)
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(403);
  });

  it('C5-PROGRESS-1: Parent can view linked child\'s progress', async () => {
    const res = await request(app)
      .get(`/api/v1/parent/children/${child.userId}/progress`)
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.progress).toEqual([]);
  });

  it('C5-PROGRESS-2: Parent CANNOT view unlinked child\'s progress', async () => {
    const res = await request(app)
      .get(`/api/v1/parent/children/${unlinkedStudent.userId}/progress`)
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(403);
  });

  it('C6-BILLING-1: Parent can view own billing', async () => {
    const courseId = createCourse();
    execute(
      "INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status) VALUES (?, ?, ?, 2500, 'USD', 'manual', 'confirmed')",
      [uuidv4(), parent.userId, courseId],
    );

    const res = await request(app)
      .get('/api/v1/parent/billing')
      .set('Authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.payments[0].amount_cents).toBe(2500);
  });

  it('C7-GROUP-1: Parent can create family group and add linked child', async () => {
    // Create group
    const createRes = await request(app)
      .post('/api/v1/parent/groups')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({ name: 'My Family' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.groupType).toBe('family');

    const groupId = createRes.body.data.id;

    // Add linked child
    const addRes = await request(app)
      .post(`/api/v1/parent/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({ userId: child.userId });

    expect(addRes.status).toBe(201);

    // Cannot add unlinked student
    const badRes = await request(app)
      .post(`/api/v1/parent/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({ userId: unlinkedStudent.userId });

    expect(badRes.status).toBe(403);
  });
});

describe('Phase C — Teacher Routes', () => {
  let teacher: { userId: string; token: string };
  let student: { userId: string; token: string };

  beforeEach(() => {
    teacher = createUserWithRole('role_teacher', 'teacher');
    student = createUserWithRole('role_student', 'student');
  });

  it('C5-TEACHER-1: Teacher can create class and invite students', async () => {
    // Create class
    const createRes = await request(app)
      .post('/api/v1/teacher/classes')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ name: 'Math 101' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.name).toBe('Math 101');
    expect(createRes.body.data.groupType).toBe('class');

    const classId = createRes.body.data.id;

    // Invite student
    const inviteRes = await request(app)
      .post(`/api/v1/teacher/classes/${classId}/invite`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ userId: student.userId });

    expect(inviteRes.status).toBe(201);

    // List class students
    const studentsRes = await request(app)
      .get(`/api/v1/teacher/classes/${classId}/students`)
      .set('Authorization', `Bearer ${teacher.token}`);

    expect(studentsRes.status).toBe(200);
    expect(studentsRes.body.data.students).toHaveLength(1);
    expect(studentsRes.body.data.students[0].id).toBe(student.userId);
  });

  it('C5-TEACHER-2: Teacher CANNOT view student wallets', async () => {
    // Teacher should not have student_wallet.read_assigned — the CI invariant test covers this.
    // But verify the parent wallets endpoint rejects teacher role:
    const res = await request(app)
      .get('/api/v1/parent/wallets')
      .set('Authorization', `Bearer ${teacher.token}`);

    expect(res.status).toBe(403);
  });

  it('C5-TEACHER-3: Teacher dashboard shows class stats', async () => {
    // Create class with members
    const classId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Science 101', 'class', ?)",
      [classId, teacher.userId],
    );
    execute('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)', [
      classId,
      student.userId,
    ]);

    const res = await request(app)
      .get('/api/v1/teacher/dashboard')
      .set('Authorization', `Bearer ${teacher.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalClasses).toBe(1);
    expect(res.body.data.totalStudents).toBe(1);
    expect(res.body.data.classes[0].studentCount).toBe(1);
  });

  it('C5-TEACHER-4: Teacher can delete own class', async () => {
    const classId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Old Class', 'class', ?)",
      [classId, teacher.userId],
    );

    const res = await request(app)
      .delete(`/api/v1/teacher/classes/${classId}`)
      .set('Authorization', `Bearer ${teacher.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('C5-TEACHER-5: Teacher CANNOT delete another teacher\'s class', async () => {
    const otherTeacher = createUserWithRole('role_teacher', 'teacher2');
    const classId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Other Class', 'class', ?)",
      [classId, otherTeacher.userId],
    );

    const res = await request(app)
      .delete(`/api/v1/teacher/classes/${classId}`)
      .set('Authorization', `Bearer ${teacher.token}`);

    expect(res.status).toBe(404);
  });

  it('C6-BILLING-2: Teacher can view own billing', async () => {
    const courseId = createCourse();
    execute(
      "INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status) VALUES (?, ?, ?, 7500, 'USD', 'manual', 'confirmed')",
      [uuidv4(), teacher.userId, courseId],
    );

    const res = await request(app)
      .get('/api/v1/teacher/billing')
      .set('Authorization', `Bearer ${teacher.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.payments[0].amount_cents).toBe(7500);
  });

  it('C7-ANALYTICS-1: Teacher analytics returns class completion stats', async () => {
    // Create class with member
    const classId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Analytics Class', 'class', ?)",
      [classId, teacher.userId],
    );
    execute('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)', [
      classId,
      student.userId,
    ]);

    const res = await request(app)
      .get('/api/v1/teacher/analytics')
      .set('Authorization', `Bearer ${teacher.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.analytics).toHaveLength(1);
    expect(res.body.data.analytics[0].class_name).toBe('Analytics Class');
    expect(res.body.data.analytics[0].total_students).toBe(1);
  });
});
