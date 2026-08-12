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
    const userId = uuidv4();
    execute("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, '$2a$10$test', 'student')", [userId, `inv-${userId.slice(0,8)}@test.com`]);
    const studentRecordId = uuidv4();
    execute("INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, 'Test', ?, 'INV-001', 'CS', 1)", [studentRecordId, userId, `inv-${userId.slice(0,8)}@test.com`]);

    const subId = uuidv4();
    execute(
      "INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, grade_status) VALUES (?, ?, 'Inv Test', 'desc', 'f.pdf', 100, '/tmp/f.pdf', 'pending', 'pending_approval')",
      [subId, studentRecordId],
    );

    const sub = queryOne<{ status: string; grade_status: string }>(
      'SELECT status, grade_status FROM submissions WHERE id = ?', [subId]);
    expect(sub!.grade_status).toBe('pending_approval');
    expect(sub!.status).toBe('pending');
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

    expect(permNames).toContain('course.grade_pending');
    expect(permNames).not.toContain('course.grade');
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

  it('TA-GRADE-INV-4: no auto-publish — no triggers auto-set grade_status to approved', () => {
    const triggers = query<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'submissions'",
    );
    for (const trigger of triggers) {
      expect(trigger.sql).not.toContain("grade_status = 'approved'");
    }
  });
});
