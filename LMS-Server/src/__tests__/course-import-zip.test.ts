/**
 * Phase 26 C4 — POST /courses/:id/import/zip tests
 *
 * ZIP-BE-1: valid ZIP with folder structure → 200 + preview
 * ZIP-BE-2: non-ZIP file → 400
 * ZIP-BE-3: empty ZIP → 400
 * ZIP-BE-4: unassigned lecturer → 403
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import AdmZip from 'adm-zip';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

interface ZipSeedResult {
  adminId: string;
  courseId: string;
  lecturerId: string;
  unassignedLecturerId: string;
}

function seedZipData(): ZipSeedResult {
  const adminId = uuidv4();
  const courseId = uuidv4();
  const lecturerId = uuidv4();
  const unassignedLecturerId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Zip Admin', 'zip-admin@test.com', '${HASH}', 'admin'),
      ('${lecturerId}', 'Zip Lecturer', 'zip-lec@test.com', '${HASH}', 'lecturer'),
      ('${unassignedLecturerId}', 'Zip Unassigned', 'zip-unassigned@test.com', '${HASH}', 'lecturer');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'ZIP Test Course', 'Test', 'ZIP-001', '[]');

    INSERT INTO course_lecturers (course_id, user_id)
    VALUES ('${courseId}', '${lecturerId}');
  `);

  return { adminId, courseId, lecturerId, unassignedLecturerId };
}

function createTestZip(files: Array<{ path: string; content: string | Buffer }>): Buffer {
  const zip = new AdmZip();
  for (const f of files) {
    zip.addFile(f.path, typeof f.content === 'string' ? Buffer.from(f.content) : f.content);
  }
  return zip.toBuffer();
}

describe('POST /api/v1/courses/:id/import/zip', () => {
  let ids: ZipSeedResult;
  let adminToken: string;

  beforeEach(() => {
    ids = seedZipData();
    adminToken = makeToken({ userId: ids.adminId, email: 'zip-admin@test.com', role: 'admin' });
  });

  it('ZIP-BE-1: valid ZIP with folder structure returns preview with correct mapping', async () => {
    const zipBuf = createTestZip([
      { path: 'Week 1/Introduction/lecture.pdf', content: '%PDF-1.4 fake pdf content' },
      { path: 'Week 1/Introduction/notes.txt', content: 'Some notes' },
      { path: 'Week 2/Lab/code.zip', content: 'fake zip content' },
      { path: 'root-file.pdf', content: '%PDF-1.4 root file' },
    ]);

    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import/zip`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipfile', zipBuf, { filename: 'course.zip', contentType: 'application/zip' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const preview = res.body.data.preview;
    expect(preview.filesStored).toBe(4);
    expect(preview.filesSkipped).toBe(0);
    expect(preview.sections.length).toBeGreaterThanOrEqual(3);

    // Check week/section mapping
    const introSection = preview.sections.find(
      (s: { title: string; week: string }) => s.week === 'Week 1' && s.title === 'Introduction',
    );
    expect(introSection).toBeDefined();
    expect(introSection.items).toHaveLength(2);

    const labSection = preview.sections.find(
      (s: { title: string; week: string }) => s.week === 'Week 2' && s.title === 'Lab',
    );
    expect(labSection).toBeDefined();
    expect(labSection.items).toHaveLength(1);

    // Root file goes to Imported/Imported
    const importedSection = preview.sections.find(
      (s: { title: string; week: string }) => s.week === 'Imported' && s.title === 'Imported',
    );
    expect(importedSection).toBeDefined();
    expect(importedSection.items).toHaveLength(1);

    // Each item has a documentId
    for (const sec of preview.sections) {
      for (const item of sec.items) {
        expect(item.documentId).toBeTruthy();
        expect(item.fileName).toBeTruthy();
      }
    }
  });

  it('ZIP-BE-2: non-ZIP file returns 400', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import/zip`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipfile', Buffer.from('not a zip'), { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
  });

  it('ZIP-BE-3: ZIP with only dotfiles/MACOSX returns 400', async () => {
    const zipBuf = createTestZip([
      { path: '__MACOSX/._file', content: 'mac metadata' },
      { path: '.hidden', content: 'hidden file' },
    ]);

    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import/zip`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipfile', zipBuf, { filename: 'empty.zip', contentType: 'application/zip' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('no extractable files');
  });

  it('ZIP-BE-4: unassigned lecturer gets 403', async () => {
    const unassignedToken = makeToken({
      userId: ids.unassignedLecturerId,
      email: 'zip-unassigned@test.com',
      role: 'lecturer',
    });
    const zipBuf = createTestZip([
      { path: 'file.txt', content: 'test' },
    ]);

    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import/zip`)
      .set('Authorization', `Bearer ${unassignedToken}`)
      .attach('zipfile', zipBuf, { filename: 'test.zip', contentType: 'application/zip' });

    expect(res.status).toBe(403);
  });
});
