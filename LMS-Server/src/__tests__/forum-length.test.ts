import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import app from '../app.js';
import request from 'supertest';

const HASH = bcrypt.hashSync('password123', 4);

function seedUserWithCourse() {
  const userId = uuidv4();
  const courseId = uuidv4();
  db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${userId}', 'User', 'user-${userId}@test.com', '${HASH}', 'student')`);
  db.exec(`INSERT INTO courses (id, title, course_code, description) VALUES ('${courseId}', 'Test Course', 'TC-${courseId.slice(0,6)}', 'desc')`);
  db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', 'TC-${courseId.slice(0,6)}')`);
  const token = makeToken({ userId, email: `user-${userId}@test.com`, role: 'student' });
  return { userId, courseId, token };
}

describe('LMS-INPUT-007: Forum title/body max length', () => {
  it('should reject topic with title > 200 chars', async () => {
    const { token } = seedUserWithCourse();
    const res = await request(app)
      .post('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'A'.repeat(201), body: 'Valid body' });
    expect(res.status).toBe(400);
  });

  it('should accept topic with title = 200 chars', async () => {
    const { token } = seedUserWithCourse();
    const res = await request(app)
      .post('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'A'.repeat(200), body: 'Valid body' });
    expect(res.status).toBe(201);
  });

  it('should reject topic with body > 10000 chars', async () => {
    const { token } = seedUserWithCourse();
    const res = await request(app)
      .post('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Valid title', body: 'B'.repeat(10001) });
    expect(res.status).toBe(400);
  });

  it('should reject post with body > 10000 chars', async () => {
    const { token, userId } = seedUserWithCourse();
    // Create a topic first
    const topicId = uuidv4();
    db.exec(`INSERT INTO forum_topics (id, title, body, author_id) VALUES ('${topicId}', 'Topic', 'Body', '${userId}')`);

    const res = await request(app)
      .post(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'C'.repeat(10001) });
    expect(res.status).toBe(400);
  });
});
