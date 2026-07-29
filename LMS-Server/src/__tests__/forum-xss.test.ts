/**
 * LMS-XSS-001/002 — Forum and message content must be HTML-escaped.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function ensureForumTables() {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='forum_topics'")
    .get();
  if (!has) {
    db.exec(`
      CREATE TABLE forum_topics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE forum_posts (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
}

function seedForumUser() {
  ensureForumTables();
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'XSS User', 'xss-${userId}@test.com', '${HASH}', 'student');
  `);
  return { userId };
}

describe('LMS-XSS-001 — forum content is HTML-escaped', () => {
  it('HTML tags in topic title and body are escaped in response', async () => {
    const { userId } = seedForumUser();
    const token = makeToken({ userId, email: `xss-${userId}@test.com`, role: 'student' });

    const res = await request(app)
      .post('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '<script>alert("xss")</script>',
        body: '<img src=x onerror="alert(1)">',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).not.toContain('<script>');
    expect(res.body.data.title).toContain('&lt;script&gt;');
    expect(res.body.data.body).not.toContain('<img');
    expect(res.body.data.body).toContain('&lt;img');
  });

  it('HTML tags in forum post body are escaped', async () => {
    const { userId } = seedForumUser();
    const token = makeToken({ userId, email: `xss-${userId}@test.com`, role: 'student' });

    // Create a topic first
    const topicRes = await request(app)
      .post('/api/v1/forum/topics')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Safe Title', body: 'Safe Body' });

    const topicId = topicRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/forum/topics/${topicId}/posts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '<script>document.cookie</script>' });

    expect(res.status).toBe(201);
    expect(res.body.data.body).not.toContain('<script>');
    expect(res.body.data.body).toContain('&lt;script&gt;');
  });
});
