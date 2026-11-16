import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const base = '/api/v1/admin/rewards/platform-credit/beneficiaries';

function user(roleId: string, legacy: 'student' | 'lecturer' | 'admin', name: string) {
  const id = uuid();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)").run(id, name, `${id}@test.invalid`, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return { id, token: `Bearer ${makeToken({ userId: id, email: `${id}@test.invalid`, role: legacy })}` };
}

describe('GET /admin/rewards/platform-credit/beneficiaries', () => {
  it('lists active people with reward funding access, other than the caller, and hides the rest', async () => {
    const admin = user('role_admin', 'admin', 'Admin Caller');
    const teacher = user('role_teacher', 'lecturer', 'Teacher Beneficiary');
    const student = user('role_student', 'student', 'Student Excluded');
    const res = await request(app).get(base).set('Authorization', admin.token);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(teacher.id);
    expect(ids).not.toContain(admin.id);
    expect(ids).not.toContain(student.id);
    expect(res.body.data.find((u: { id: string }) => u.id === teacher.id)).toMatchObject({ name: 'Teacher Beneficiary', email: expect.stringContaining('@test.invalid') });
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['email', 'id', 'name']);
  });

  it('leaves out people whose account is being deleted', async () => {
    const admin = user('role_admin', 'admin', 'Admin Caller');
    const gone = user('role_teacher', 'lecturer', 'Teacher Leaving');
    db.prepare("UPDATE users SET deletion_status = 'pending_deletion' WHERE id = ?").run(gone.id);
    const res = await request(app).get(base).set('Authorization', admin.token);
    expect(res.body.data.map((u: { id: string }) => u.id)).not.toContain(gone.id);
  });

  it('is closed to a teacher and to anonymous callers', async () => {
    const teacher = user('role_teacher', 'lecturer', 'Teacher Caller');
    expect((await request(app).get(base)).status).toBe(401);
    expect((await request(app).get(base).set('Authorization', teacher.token)).status).toBe(403);
  });
});
