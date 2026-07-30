import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import app from '../app.js';
import request from 'supertest';

const HASH = bcrypt.hashSync('password123', 4);

beforeEach(() => {
  // Ensure announcements table exists (not in schema.sql, created by ensure* at import)
  const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='announcements'").get();
  if (!has) {
    db.exec(`
      CREATE TABLE announcements (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL,
        scope      TEXT NOT NULL DEFAULT 'general' CHECK (scope IN ('general', 'course')),
        course_id  TEXT REFERENCES courses(id) ON DELETE CASCADE,
        author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pinned     INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
});

function seedAdmin() {
  const id = uuidv4();
  db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${id}', 'Admin', 'admin-${id}@test.com', '${HASH}', 'admin')`);
  return makeToken({ userId: id, email: `admin-${id}@test.com`, role: 'admin' });
}

describe('LMS-XSS-003: HTML-escape announcements', () => {
  it('should escape <script> tags in announcement title and body on create', async () => {
    const token = seedAdmin();
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '<script>alert("xss")</script>',
        body: '<img onerror="alert(1)" src=x>',
        scope: 'general',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toContain('&lt;script&gt;');
    expect(res.body.data.title).not.toContain('<script>');
    expect(res.body.data.body).toContain('&lt;img');
    expect(res.body.data.body).not.toContain('<img');
  });

  it('should escape <script> tags in announcement title on update', async () => {
    const token = seedAdmin();
    // Create clean announcement first
    const createRes = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Safe', body: 'Safe body', scope: 'general' });
    const id = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/announcements/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '<script>xss</script>' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toContain('&lt;script&gt;');
  });
});
