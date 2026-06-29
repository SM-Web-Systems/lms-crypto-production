import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { seedTestData, type TestIds } from './helpers/seed.js';
import { makeToken } from './helpers/auth.js';
import { execute } from '../config/database.js';

let ids: TestIds;
let adminToken: string;
let studentToken: string;

beforeEach(() => {
  ids = seedTestData();
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
  studentToken = makeToken({
    userId: ids.studentUserId,
    email: 'student@test.com',
    role: 'student',
    studentId: ids.studentId,
  });
});

// ── List documents ────────────────────────────────────────

describe('GET /api/v1/documents', () => {
  it('admin sees all documents', async () => {
    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents).toHaveLength(1);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      total: 1,
    });
  });

  it('student sees unrestricted documents', async () => {
    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBeGreaterThanOrEqual(1);
  });

  it('student cannot see course-restricted doc they lack access to', async () => {
    execute(
      `UPDATE course_documents SET course_ids = ? WHERE id = ?`,
      [JSON.stringify([ids.course2Id]), ids.documentId],
    );

    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const docIds = res.body.data.documents.map((d: { id: string }) => d.id);
    expect(docIds).not.toContain(ids.documentId);
  });

  it('filters by category', async () => {
    const res = await request(app)
      .get('/api/v1/documents?category=Lecture%20Notes')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents).toHaveLength(1);
  });

  it('search filters by title', async () => {
    const res = await request(app)
      .get('/api/v1/documents?search=Lecture')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents).toHaveLength(1);

    const empty = await request(app)
      .get('/api/v1/documents?search=nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(empty.body.data.documents).toHaveLength(0);
  });

  it('respects pagination params', async () => {
    const res = await request(app)
      .get('/api/v1/documents?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(1);
  });
});

// ── Single document ───────────────────────────────────────

describe('GET /api/v1/documents/:id', () => {
  it('returns document by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${ids.documentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: ids.documentId,
      title: 'Lecture 1 Notes',
      category: 'Lecture Notes',
      fileName: 'lecture1.pdf',
    });
    expect(res.body.data.fileUrl).toContain(ids.documentId);
  });

  it('returns 404 for non-existent document', async () => {
    const res = await request(app)
      .get('/api/v1/documents/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('student blocked from course-restricted doc', async () => {
    execute(
      `UPDATE course_documents SET course_ids = ? WHERE id = ?`,
      [JSON.stringify([ids.course2Id]), ids.documentId],
    );

    const res = await request(app)
      .get(`/api/v1/documents/${ids.documentId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});

// ── Update document metadata ──────────────────────────────

describe('PUT /api/v1/documents/:id', () => {
  it('admin updates document metadata', async () => {
    const res = await request(app)
      .put(`/api/v1/documents/${ids.documentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title', category: 'Assignments' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
    expect(res.body.data.category).toBe('Assignments');
  });

  it('no-op update returns current document', async () => {
    const res = await request(app)
      .put(`/api/v1/documents/${ids.documentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ids.documentId);
  });

  it('returns 404 for non-existent document', async () => {
    const res = await request(app)
      .put('/api/v1/documents/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'X' });

    expect(res.status).toBe(404);
  });

  it('student cannot update documents', async () => {
    const res = await request(app)
      .put(`/api/v1/documents/${ids.documentId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });
});

// ── Delete document ───────────────────────────────────────

describe('DELETE /api/v1/documents/:id', () => {
  it('admin deletes document', async () => {
    const res = await request(app)
      .delete(`/api/v1/documents/${ids.documentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await request(app)
      .get(`/api/v1/documents/${ids.documentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(check.status).toBe(404);
  });

  it('returns 404 for non-existent document', async () => {
    const res = await request(app)
      .delete('/api/v1/documents/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('student cannot delete documents', async () => {
    const res = await request(app)
      .delete(`/api/v1/documents/${ids.documentId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});

// ── Categories ────────────────────────────────────────────

describe('GET /api/v1/documents/categories', () => {
  it('returns merged default + DB categories', async () => {
    const res = await request(app)
      .get('/api/v1/documents/categories')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toContain('Lecture Notes');
    expect(res.body.data.categories).toContain('Assignments');
    expect(res.body.data.categories.length).toBeGreaterThanOrEqual(8);
  });
});
