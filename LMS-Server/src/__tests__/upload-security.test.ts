/**
 * LMS-UPLOAD-001 — Unauthenticated static serving scoped to avatars only.
 * Submissions and documents must NOT be served via express.static.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../app.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');

describe('LMS-UPLOAD-001 — static uploads scoped to avatars only', () => {
  it('GET /uploads/submissions/test.pdf returns 404 (not statically served)', async () => {
    // Create a dummy file in submissions dir to prove static doesn't serve it
    const subDir = path.join(UPLOAD_DIR, 'submissions');
    fs.mkdirSync(subDir, { recursive: true });
    const testFile = path.join(subDir, 'test-upload-security.pdf');
    fs.writeFileSync(testFile, 'secret submission content');

    try {
      const res = await request(app).get('/uploads/submissions/test-upload-security.pdf');
      expect(res.status).toBe(404);
    } finally {
      // Cleanup
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  it('GET /uploads/avatars/test.png is served (avatars still work)', async () => {
    const avatarDir = path.join(UPLOAD_DIR, 'avatars');
    fs.mkdirSync(avatarDir, { recursive: true });
    const testFile = path.join(avatarDir, 'test-upload-security.png');
    fs.writeFileSync(testFile, 'avatar data');

    try {
      const res = await request(app).get('/uploads/avatars/test-upload-security.png');
      expect(res.status).toBe(200);
    } finally {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });
});
