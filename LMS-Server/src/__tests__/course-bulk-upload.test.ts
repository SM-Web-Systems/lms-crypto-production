import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { seedTestData, type TestIds } from './helpers/seed.js';

const HASH = bcrypt.hashSync('password123', 4);

let ids: TestIds;
let adminToken: string;
let lecturerUserId: string;
let lecturerToken: string;
let unassignedLecturerToken: string;

function seedLecturerData() {
  // Create lecturer user assigned to course
  lecturerUserId = uuidv4();
  const unassignedLecturerId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test Lecturer', ?, ?, 'lecturer')`,
  ).run(lecturerUserId, `lecturer-${lecturerUserId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Unassigned Lecturer', ?, ?, 'lecturer')`,
  ).run(unassignedLecturerId, `lecturer2-${unassignedLecturerId}@test.com`, HASH);

  // Assign lecturer to course via course_lecturers
  db.prepare(
    `INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES (?, ?, ?)`,
  ).run(ids.courseId, lecturerUserId, ids.adminId);

  lecturerToken = makeToken({ userId: lecturerUserId, email: `lecturer-${lecturerUserId}@test.com`, role: 'lecturer' });
  unassignedLecturerToken = makeToken({ userId: unassignedLecturerId, email: `lecturer2-${unassignedLecturerId}@test.com`, role: 'lecturer' });
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
}

beforeEach(() => {
  ids = seedTestData();
  seedLecturerData();
});

describe('Course Bulk Upload — Lecturer Access (Phase 26 C2)', () => {
  it('BULK-UP-BE-1: lecturer with course assignment can GET /courses and see assigned courses', async () => {
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${lecturerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const courseIds = res.body.data.courses.map((c: { id: string }) => c.id);
    expect(courseIds).toContain(ids.courseId);
  });

  it('BULK-UP-BE-2: lecturer with course assignment can PUT /courses/:id to update sections', async () => {
    const updatedSections = [
      {
        id: uuidv4(),
        title: 'Updated Section',
        objective: 'Test objective',
        outcome: 'Test outcome',
        items: [
          { id: uuidv4(), type: 'video', title: 'New Video', order: 1, url: 'https://youtube.com/watch?v=test' },
        ],
      },
    ];

    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({ sections: updatedSections });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sections).toHaveLength(1);
    expect(res.body.data.sections[0].title).toBe('Updated Section');
  });

  it('BULK-UP-BE-3: lecturer without course assignment cannot update a course', async () => {
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${unassignedLecturerToken}`)
      .send({ sections: [] });

    // The unassigned lecturer has course.manage permission (via instructor role),
    // but getCourse checks course_lecturers assignment and returns 403
    expect(res.status).toBe(403);
  });

  it('BULK-UP-BE-4: POST /documents with valid PDF file returns document with ID', async () => {
    // Create a minimal PDF buffer
    const pdfContent = Buffer.from('%PDF-1.4 test content');
    const tmpDir = path.join('/tmp', 'bulk-upload-test-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'test-upload.pdf');
    fs.writeFileSync(tmpFile, pdfContent);

    try {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'Bulk Upload Test Doc')
        .field('description', 'Test document for bulk upload')
        .field('category', 'Course Materials')
        .attach('file', tmpFile, { contentType: 'application/pdf' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe('Bulk Upload Test Doc');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
