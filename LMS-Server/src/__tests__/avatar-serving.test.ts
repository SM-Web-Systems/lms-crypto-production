/**
 * Avatar upload + serving integration tests.
 *
 * Verifies:
 *  1. POST /api/v1/profile/avatar stores file and returns avatarUrl
 *  2. GET /uploads/avatars/<filename> serves the file (express.static)
 *  3. Non-image MIME types are rejected
 *  4. Unauthenticated upload is rejected
 *  5. All three roles can upload avatars
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);
const createdFiles: string[] = [];

// user_profiles is created by ensureUserProfilesTable() at module load, but
// _resetForTests drops all tables and re-creates from schema.sql (which lacks
// user_profiles). Re-create it before each test.
beforeEach(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      avatar_path  TEXT,
      whatsapp     TEXT,
      telegram     TEXT,
      linkedin_url TEXT,
      github_url   TEXT,
      twitter_url  TEXT,
      website_url  TEXT,
      custom_links TEXT DEFAULT '[]',
      updated_at   TEXT DEFAULT (datetime('now'))
    )
  `);
});

function seedUser(role: 'admin' | 'student' | 'lecturer') {
  const userId = uuidv4();
  const email = `avatar-test-${userId.slice(0, 8)}@test.com`;
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'Avatar Test User', '${email}', '${HASH}', '${role}');
  `);
  return { userId, email, token: makeToken({ userId, email, role }) };
}

// Minimal valid 1x1 PNG
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

afterAll(() => {
  for (const f of createdFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe('Avatar upload + serving', () => {
  it('uploads avatar and returns a URL that resolves to image data', async () => {
    const { token } = seedUser('student');

    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', VALID_PNG, 'test-avatar.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.avatarUrl).toMatch(/\/uploads\/avatars\/.+\.png$/);

    // Extract the path and verify express.static serves it
    const urlPath = new URL(res.body.data.avatarUrl).pathname;
    const serveRes = await request(app).get(urlPath);
    expect(serveRes.status).toBe(200);
    expect(serveRes.headers['content-type']).not.toContain('text/html');

    // Track for cleanup
    const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
    createdFiles.push(path.join(UPLOAD_DIR, 'avatars', path.basename(urlPath)));
  });

  it('rejects non-image MIME types', async () => {
    const { token } = seedUser('admin');

    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', Buffer.from('not an image'), {
        filename: 'malicious.exe',
        contentType: 'application/x-msdownload',
      });

    // multer fileFilter rejects → error bubbles as 500
    expect(res.status).toBe(500);
  });

  it('rejects unauthenticated upload', async () => {
    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .attach('avatar', VALID_PNG, 'test.png');

    expect(res.status).toBe(401);
  });

  it('returns 404 for nonexistent avatar', async () => {
    const res = await request(app).get('/uploads/avatars/nonexistent-uuid.png');
    expect(res.status).toBe(404);
  });

  it('works for all three roles', async () => {
    for (const role of ['admin', 'student', 'lecturer'] as const) {
      const { token } = seedUser(role);

      const res = await request(app)
        .post('/api/v1/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', VALID_PNG, `avatar-${role}.png`);

      expect(res.status).toBe(200);
      expect(res.body.data.avatarUrl).toMatch(/\/uploads\/avatars\//);

      const urlPath = new URL(res.body.data.avatarUrl).pathname;
      const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
      createdFiles.push(path.join(UPLOAD_DIR, 'avatars', path.basename(urlPath)));
    }
  });
});
