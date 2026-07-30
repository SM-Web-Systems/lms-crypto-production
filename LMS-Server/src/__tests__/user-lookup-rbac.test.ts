/**
 * LMS-USER-001 — Students cannot look up other users' profiles.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedData() {
  const studentId = uuidv4();
  const otherId = uuidv4();
  const adminId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${studentId}', 'Student RBAC', 'student-rbac-${studentId}@test.com', '${HASH}', 'student'),
      ('${otherId}', 'Other User', 'other-rbac-${otherId}@test.com', '${HASH}', 'student'),
      ('${adminId}', 'Admin RBAC', 'admin-rbac-${adminId}@test.com', '${HASH}', 'admin');
  `);

  return { studentId, otherId, adminId };
}

describe('LMS-USER-001 — user lookup RBAC', () => {
  it('student looking up another user gets 403', async () => {
    const { studentId, otherId } = seedData();
    const jwt = makeToken({ userId: studentId, email: `student-rbac-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/users/${otherId}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(403);
  });

  it('student looking up self gets 200', async () => {
    const { studentId } = seedData();
    const jwt = makeToken({ userId: studentId, email: `student-rbac-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/users/${studentId}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('admin looking up any user gets 200', async () => {
    const { adminId, otherId } = seedData();
    const jwt = makeToken({ userId: adminId, email: `admin-rbac-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/users/${otherId}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
