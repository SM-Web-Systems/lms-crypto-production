/**
 * Phase 26 C3 — POST /courses/:id/import tests
 *
 * IMP-BE-1: append mode — sections are appended to existing
 * IMP-BE-2: validation errors (missing url, quizId, fileName, invalid type)
 * IMP-BE-3: replace mode — only imported sections remain
 * IMP-BE-4: unassigned lecturer → 403
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

interface SeedResult {
  adminId: string;
  courseId: string;
  lecturerId: string;
  unassignedLecturerId: string;
}

function seedImportData(): SeedResult {
  const adminId = uuidv4();
  const courseId = uuidv4();
  const lecturerId = uuidv4();
  const unassignedLecturerId = uuidv4();
  const existingSectionId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Import Admin', 'import-admin@test.com', '${HASH}', 'admin'),
      ('${lecturerId}', 'Import Lecturer', 'import-lecturer@test.com', '${HASH}', 'lecturer'),
      ('${unassignedLecturerId}', 'Unassigned Lecturer', 'import-unassigned@test.com', '${HASH}', 'lecturer');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES (
      '${courseId}',
      'Import Test Course',
      'Test course for import',
      'IMP-001',
      '${JSON.stringify([{ id: existingSectionId, title: "Getting Started", items: [] }])}'
    );

    INSERT INTO course_lecturers (course_id, user_id)
    VALUES ('${courseId}', '${lecturerId}');
  `);

  return { adminId, courseId, lecturerId, unassignedLecturerId };
}

describe('POST /api/v1/courses/:id/import', () => {
  let ids: SeedResult;
  let adminToken: string;

  beforeEach(() => {
    ids = seedImportData();
    adminToken = makeToken({ userId: ids.adminId, email: 'import-admin@test.com', role: 'admin' });
  });

  it('IMP-BE-1: appends imported sections to existing sections (default append mode)', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sections: [
          {
            title: 'New Section One',
            objective: 'Learn new things',
            items: [
              { type: 'video', title: 'Intro Video', url: 'https://example.com/vid.mp4' },
              { type: 'text', title: 'Reading Material', description: 'Some text content' },
              { type: 'pdf', title: 'Lecture Notes', documentId: 'doc-123' },
            ],
          },
          {
            title: 'New Section Two',
            items: [
              { type: 'quiz', title: 'Knowledge Check', quizId: 'quiz-abc' },
              { type: 'download', title: 'Resources', fileName: 'resources.zip' },
            ],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sectionsImported).toBe(2);
    expect(res.body.data.itemsImported).toBe(5);

    // Original section + 2 new sections = 3 total
    const course = res.body.data.course;
    expect(course.sections).toHaveLength(3);
    expect(course.sections[0].title).toBe('Getting Started');
    expect(course.sections[1].title).toBe('New Section One');
    expect(course.sections[2].title).toBe('New Section Two');
  });

  it('IMP-BE-2: returns 400 with validation error details for invalid items', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sections: [
          {
            title: 'Problem Section',
            items: [
              // missing url on video
              { type: 'video', title: 'Video Without URL' },
              // missing quizId on quiz
              { type: 'quiz', title: 'Quiz Without ID' },
              // missing fileName on download
              { type: 'download', title: 'Download Without FileName' },
              // invalid type
              { type: 'unknown_type', title: 'Bad Type Item' },
            ],
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Import validation failed');
    expect(Array.isArray(res.body.error.details)).toBe(true);

    const details = res.body.error.details as Array<{ field: string; message: string }>;
    const fields = details.map((d) => d.field);
    expect(fields).toContain('url');
    expect(fields).toContain('quizId');
    expect(fields).toContain('fileName');
    expect(fields).toContain('type');
  });

  it('IMP-BE-3: replaces all existing sections when mode=replace', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        mode: 'replace',
        sections: [
          {
            title: 'Replacement Section',
            items: [
              { type: 'link', title: 'External Resource', url: 'https://example.com/resource' },
            ],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sectionsImported).toBe(1);
    expect(res.body.data.itemsImported).toBe(1);

    // Only the replacement section remains (original "Getting Started" is gone)
    const course = res.body.data.course;
    expect(course.sections).toHaveLength(1);
    expect(course.sections[0].title).toBe('Replacement Section');
  });

  it('IMP-BE-4: unassigned lecturer receives 403', async () => {
    const unassignedToken = makeToken({
      userId: ids.unassignedLecturerId,
      email: 'import-unassigned@test.com',
      role: 'lecturer',
    });

    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/import`)
      .set('Authorization', `Bearer ${unassignedToken}`)
      .send({
        sections: [{ title: 'Sneaky Section', items: [] }],
      });

    expect(res.status).toBe(403);
  });
});
