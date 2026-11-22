// Staging bug: "Add Student" for someone with no LMS account saved the student but failed with "User not found"
// when saving the selected course access, so the dialog stayed open and the list showed no access.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { createRbacAccount } from '../services/rbacAccountService.js';

const HASH = bcrypt.hashSync('password123', 4);

function seed() {
  const adminId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, ?, 'admin')").run(adminId, `admin-${adminId}@test.com`, HASH);
  const code = `ACC-${uuidv4().slice(0, 8).toUpperCase()}`;
  db.prepare("INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Access course', 'd', ?, '[]')").run(uuidv4(), code);
  return { token: makeToken({ userId: adminId, email: `admin-${adminId}@test.com`, role: 'admin' }), code };
}

describe('admin adds a student who has no LMS account yet', () => {
  it('saves the course access, shows it on the student, and gives it to the account when it is made', async () => {
    const { token, code } = seed();
    const email = `new-${uuidv4()}@test.com`;
    const created = await request(app).post('/api/v1/students').set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Learner', email, enrollmentNumber: `ENR-${uuidv4().slice(0, 8)}`, department: 'CS', semester: 1 });
    expect(created.status).toBe(201);
    expect(created.body.data.userId).toBeNull();

    // The web app sends the student id when there is no account.
    const patched = await request(app).patch(`/api/v1/users/${created.body.data.id}`).set('Authorization', `Bearer ${token}`)
      .send({ courseCodes: [code.toLowerCase()] });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ courseCodes: [code], pending: true });

    const list = await request(app).get('/api/v1/students').query({ search: email }).set('Authorization', `Bearer ${token}`);
    const row = list.body.data.students.find((s: { email: string }) => s.email === email);
    expect(row.pendingCourseCodes).toEqual([code]);

    const bad = await request(app).patch(`/api/v1/users/${created.body.data.id}`).set('Authorization', `Bearer ${token}`).send({ courseCodes: ['NOPE-404'] });
    expect(bad.status).toBe(400);

    const account = createRbacAccount({ name: 'New Learner', email: email.toUpperCase(), passwordHash: HASH, initialRoleId: 'role_student' });
    expect(account.studentId).toBe(created.body.data.id); // linked to the admin's record, not a second one
    const codes = db.prepare('SELECT course_code FROM user_course_codes WHERE user_id = ?').all(account.id) as { course_code: string }[];
    expect(codes.map((c) => c.course_code)).toEqual([code]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM pending_course_codes WHERE email = ?').get(email)).toEqual({ n: 0 });
  });

  it('still returns 404 for an id that is neither a user nor a student', async () => {
    const { token } = seed();
    const res = await request(app).patch(`/api/v1/users/${uuidv4()}`).set('Authorization', `Bearer ${token}`).send({ courseCodes: [] });
    expect(res.status).toBe(404);
  });
});
