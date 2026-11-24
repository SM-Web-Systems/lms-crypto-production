/**
 * Who can see names, emails and roles, and the "nobody sees or touches roles above them" rule.
 *
 * DV-1 Lecturer GET /users: only learners on courses they lecture, no emails.
 * DV-2 Lecturer search: only own learners, never matched by email.
 * DV-3 Lecturer /students: 403 for read and write (roster is admin-only).
 * DV-4 Admin GET /users: Extended and Super admin rows are masked with "Higher access".
 * DV-5 Extended admin: Super admin masked, Admin visible; Super admin sees everyone.
 * DV-6 GET /admin/users/:id/roles hides roles above the viewer.
 * DV-7 A custom role ranks like the lowest built-in role that has all its permissions.
 */
import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../app.js';
import { execute } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

function actor(roleId: string, legacy: 'student' | 'lecturer' | 'admin' = 'student') {
  const id = randomUUID();
  const email = `${id}@dv.invalid`;
  execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (?, ?, ?, 'unused', ?)", [id, `DV ${roleId} ${id.slice(0, 6)}`, email, legacy]);
  execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
  execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [id, roleId]);
  return { id, email, token: generateToken({ userId: id, email, role: legacy }) };
}
function courseWith(lecturerId: string, learnerIds: string[]) {
  const id = randomUUID();
  const code = `DV-${id.slice(0, 8)}`.toUpperCase();
  execute("INSERT INTO courses (id,title,description,course_code,sections) VALUES (?, 'DV course', 'd', ?, '[]')", [id, code]);
  execute('INSERT INTO course_lecturers (course_id,user_id) VALUES (?,?)', [id, lecturerId]);
  for (const l of learnerIds) execute('INSERT INTO user_course_codes (user_id,course_code) VALUES (?,?)', [l, code]);
  return { id, code };
}
type Row = { id: string; email?: string; restricted?: boolean; roleSummaries?: { name: string; label: string }[] };
async function directory(who: { token: string }): Promise<Row[]> {
  const res = await request(app).get('/api/v1/users').auth(who.token, { type: 'bearer' });
  expect(res.status).toBe(200);
  return res.body.data.users;
}

describe('directory visibility', () => {
  it('DV-1: lecturer list holds only their own learners, without emails', async () => {
    const lecturer = actor('role_instructor', 'lecturer');
    const mine = actor('role_student');
    const other = actor('role_student');
    courseWith(lecturer.id, [mine.id]);
    const rows = await directory(lecturer);
    expect(rows.map(r => r.id)).toEqual([mine.id]);
    expect(rows[0].email).toBeUndefined();
    expect(rows.map(r => r.id)).not.toContain(other.id);
  });

  it('DV-2: lecturer search finds own learners by name only', async () => {
    const lecturer = actor('role_instructor', 'lecturer');
    const mine = actor('role_student');
    const other = actor('role_student');
    courseWith(lecturer.id, [mine.id]);
    const byName = await request(app).get('/api/v1/search').query({ q: 'DV role_student', types: 'users' }).auth(lecturer.token, { type: 'bearer' });
    expect(byName.status).toBe(200);
    const ids = (byName.body.data.results.users ?? []).map((u: Row) => u.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(other.id);
    expect((byName.body.data.results.users ?? []).every((u: Row) => u.email === undefined)).toBe(true);
    const byEmail = await request(app).get('/api/v1/search').query({ q: mine.email.slice(0, 12), types: 'users' }).auth(lecturer.token, { type: 'bearer' });
    expect((byEmail.body.data.results.users ?? []).map((u: Row) => u.id)).not.toContain(mine.id);
  });

  it('DV-3: lecturer cannot read or change the student roster', async () => {
    const lecturer = actor('role_instructor', 'lecturer');
    const list = await request(app).get('/api/v1/students').auth(lecturer.token, { type: 'bearer' });
    expect(list.status).toBe(403);
    const create = await request(app).post('/api/v1/students').auth(lecturer.token, { type: 'bearer' })
      .send({ name: 'X', email: `${randomUUID()}@dv.invalid` });
    expect(create.status).toBe(403);
    const admin = actor('role_admin', 'admin');
    const ok = await request(app).get('/api/v1/students').auth(admin.token, { type: 'bearer' });
    expect(ok.status).toBe(200);
  });

  it('DV-4: admin sees Extended and Super admins masked', async () => {
    const admin = actor('role_admin', 'admin');
    const peer = actor('role_admin', 'admin');
    const ext = actor('role_admin2', 'admin');
    const sup = actor('role_super_admin', 'admin');
    const rows = await directory(admin);
    const byId = new Map(rows.map(r => [r.id, r]));
    expect(byId.get(peer.id)).toMatchObject({ email: peer.email, restricted: false });
    for (const hidden of [ext, sup]) {
      const row = byId.get(hidden.id)!;
      expect(row.restricted).toBe(true);
      expect(row.email).not.toBe(hidden.email);
      expect(row.email).toMatch(/^.\*\*\*@dv\.invalid$/);
      expect(row.roleSummaries!.map(r => r.label)).toEqual(['Higher access']);
    }
    expect(byId.get(admin.id)).toMatchObject({ email: admin.email, restricted: false });
  });

  it('DV-5: extended admin sees Super admin masked; Super admin sees everyone', async () => {
    const ext = actor('role_admin2', 'admin');
    const admin = actor('role_admin', 'admin');
    const sup = actor('role_super_admin', 'admin');
    const extRows = new Map((await directory(ext)).map(r => [r.id, r]));
    expect(extRows.get(admin.id)).toMatchObject({ email: admin.email, restricted: false });
    expect(extRows.get(sup.id)!.restricted).toBe(true);
    const supRows = await directory(sup);
    expect(supRows.every(r => r.restricted === false)).toBe(true);
    expect(supRows.find(r => r.id === ext.id)!.email).toBe(ext.email);
  });

  it('DV-6: role read hides roles above the viewer', async () => {
    const ext = actor('role_admin2', 'admin');
    const sup = actor('role_super_admin', 'admin');
    execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [sup.id, 'role_student']);
    const res = await request(app).get(`/api/v1/admin/users/${sup.id}/roles`).auth(ext.token, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { role_name: string }) => r.role_name).sort()).toEqual(['restricted', 'student']);
  });

  it('DV-7: extended admin cannot hand out a custom role as strong as their own', async () => {
    const ext = actor('role_admin2', 'admin');
    const target = actor('role_student');
    const roleId = `dv-${randomUUID().slice(0, 8)}`;
    execute('INSERT INTO roles (id,name,label,is_system) VALUES (?,?,?,0)', [roleId, roleId, 'DV strong']);
    execute("INSERT INTO role_permissions (role_id,permission_id) VALUES (?, 'perm_user_assign_role')", [roleId]);
    const strong = await request(app).post(`/api/v1/admin/users/${target.id}/roles`).auth(ext.token, { type: 'bearer' }).send({ roleId });
    expect(strong.status).toBe(403);
    const options = await request(app).get(`/api/v1/admin/users/${target.id}/role-options`).auth(ext.token, { type: 'bearer' });
    expect(options.body.data.assignableRoles.map((r: { id: string }) => r.id)).not.toContain(roleId);

    const weakId = `dv-${randomUUID().slice(0, 8)}`;
    execute('INSERT INTO roles (id,name,label,is_system) VALUES (?,?,?,0)', [weakId, weakId, 'DV weak']);
    execute("INSERT INTO role_permissions (role_id,permission_id) VALUES (?, 'perm_course_view')", [weakId]);
    const weak = await request(app).post(`/api/v1/admin/users/${target.id}/roles`).auth(ext.token, { type: 'bearer' }).send({ roleId: weakId });
    expect(weak.status).toBe(201);
  });
});
