import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import app from '../app.js';
import request from 'supertest';

const HASH = bcrypt.hashSync('password123', 4);

function seedAdmin() {
  const id = uuidv4();
  db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${id}', 'Admin', 'admin-${id}@test.com', '${HASH}', 'admin')`);
  return makeToken({ userId: id, email: `admin-${id}@test.com`, role: 'admin' });
}

describe('LMS-INPUT-001/002: Student email validation', () => {
  const badEmails = ['@', 'x@', '@.com', 'no-at-sign', '  @  ', 'a@ b.com'];

  for (const email of badEmails) {
    it(`should reject invalid email "${email}" in createStudent`, async () => {
      const token = seedAdmin();
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test',
          email,
          enrollmentNumber: 'ENR-001',
          department: 'CS',
          semester: 1,
        });
      expect(res.status).toBe(400);
    });
  }

  it('should reject invalid emails in importStudents', async () => {
    const token = seedAdmin();
    // seed a course for the import
    const courseId = uuidv4();
    db.exec(`INSERT INTO courses (id, title, course_code, description) VALUES ('${courseId}', 'Test', 'TST-100', 'desc')`);

    const res = await request(app)
      .post('/api/v1/students/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId,
        students: [
          { name: 'Bad1', email: '@', enrollmentNumber: 'E1', department: 'CS', semester: 1 },
          { name: 'Bad2', email: 'x@', enrollmentNumber: 'E2', department: 'CS', semester: 1 },
          { name: 'Good', email: 'good@test.com', enrollmentNumber: 'E3', department: 'CS', semester: 1 },
        ],
      });
    expect([200, 207]).toContain(res.status);
    // Bad emails should be skipped
    const skipped = res.body.data?.results?.filter((r: { status: string }) => r.status === 'skipped') ?? [];
    expect(skipped.length).toBeGreaterThanOrEqual(2);
  });
});
