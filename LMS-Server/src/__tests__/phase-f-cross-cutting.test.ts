/**
 * Phase F — Cross-Cutting Features Tests
 *
 * F1-HISTORY-1: User can view own login history
 * F1-HISTORY-2: Admin can view any user's login history
 * F1-HISTORY-3: Parent can view linked child's login history (regression)
 * F1-HISTORY-4: Parent CANNOT view unlinked student's login history (regression)
 * F1-HISTORY-5: Teacher can view assigned student's login history
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute, query, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

// ── Helpers ──────────────────────────────────────────────────────────

function createUser(role: 'student' | 'lecturer' | 'admin', email?: string): string {
  const id = uuidv4();
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', ?)",
    [id, `Test ${role}`, email ?? `${id}@test.com`, role],
  );
  const roleMap: Record<string, string> = {
    student: 'role_student',
    lecturer: 'role_instructor',
    admin: 'role_admin',
  };
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleMap[role]]);
  return id;
}

function assignRole(userId: string, roleId: string): void {
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
}

function makeToken(userId: string, role: 'student' | 'lecturer' | 'admin'): string {
  return generateToken({ userId, email: `${userId}@test.com`, role });
}

function insertLoginHistory(userId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    execute(
      "INSERT INTO login_history (user_id, ip_address, user_agent, auth_method) VALUES (?, '127.0.0.1', 'test-agent', 'local')",
      [userId],
    );
  }
}

// ── F1: Login History API ────────────────────────────────────────────

describe('F1: Login History API', () => {
  it('F1-HISTORY-1: User can view own login history', async () => {
    const userId = createUser('student');
    const token = makeToken(userId, 'student');
    insertLoginHistory(userId, 3);

    const res = await request(app)
      .get('/api/v1/login-history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.history).toHaveLength(3);
    expect(res.body.data.history[0]).toHaveProperty('login_at');
    expect(res.body.data.history[0]).toHaveProperty('ip_address');
    expect(res.body.data.history[0]).toHaveProperty('auth_method');
  });

  it("F1-HISTORY-2: Admin can view any user's login history", async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const adminToken = makeToken(adminId, 'admin');
    insertLoginHistory(studentId, 2);

    const res = await request(app)
      .get(`/api/v1/admin/users/${studentId}/login-history`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });

  it("F1-HISTORY-3: Parent can view linked child's login history", async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const childId = createUser('student');
    const parentToken = makeToken(parentId, 'student');
    // Link parent→child using correct schema (link_type, no status column)
    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
      [uuidv4(), parentId, childId],
    );
    insertLoginHistory(childId, 2);

    const res = await request(app)
      .get(`/api/v1/parent/children/${childId}/login-history`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });

  it("F1-HISTORY-4: Parent CANNOT view unlinked student's login history", async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const unlinkedId = createUser('student');
    const parentToken = makeToken(parentId, 'student');
    insertLoginHistory(unlinkedId, 2);

    const res = await request(app)
      .get(`/api/v1/parent/children/${unlinkedId}/login-history`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(403);
  });

  it("F1-HISTORY-5: Teacher can view assigned student's login history", async () => {
    const teacherId = createUser('lecturer');
    assignRole(teacherId, 'role_teacher');
    const studentId = createUser('student');
    const teacherToken = makeToken(teacherId, 'lecturer');
    // Create a class group and add the student — correct schema uses owner_user_id
    const groupId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, owner_user_id, group_type) VALUES (?, 'Test Class', ?, 'class')",
      [groupId, teacherId],
    );
    // user_group_members has no id column — composite PK (group_id, user_id)
    execute(
      'INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, studentId],
    );
    insertLoginHistory(studentId, 2);

    const res = await request(app)
      .get(`/api/v1/teacher/classes/${groupId}/students/${studentId}/login-history`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });
});
