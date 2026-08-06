/**
 * DOCS-1 — GET /api-docs/spec.json returns 200 + valid JSON
 * DOCS-2 — Spec has required OpenAPI fields
 * DOCS-3 — Spec contains all expected tags
 * DOCS-4 — GET /api-docs/ returns 200 + HTML with swagger
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('DOCS-1 — OpenAPI spec endpoint', () => {
  it('should return 200 with valid JSON spec', async () => {
    const res = await request(app).get('/api-docs/spec.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toBeDefined();
    expect(typeof res.body).toBe('object');
  });
});

describe('DOCS-2 — OpenAPI spec structure', () => {
  it('should have required OpenAPI 3.0 fields', async () => {
    const res = await request(app).get('/api-docs/spec.json');
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info).toBeDefined();
    expect(res.body.info.title).toBe('LMS API');
    expect(res.body.info.version).toBeDefined();
    expect(res.body.paths).toBeDefined();
    expect(typeof res.body.paths).toBe('object');
  });
});

describe('DOCS-3 — OpenAPI spec tags', () => {
  it('should contain all 26 expected tags', async () => {
    const res = await request(app).get('/api-docs/spec.json');
    const tagNames = res.body.tags.map((t: { name: string }) => t.name);
    const expected = [
      'Health', 'Auth', 'Users', 'Profile', 'Courses', 'Students',
      'Lessons', 'Progress', 'Quizzes', 'Submissions', 'Certificates',
      'Payments', 'Cohorts', 'Analytics', 'Documents', 'Announcements',
      'Forum', 'Messages', 'Notifications', 'Invites', 'Wallet',
      'Admin', 'RBAC', 'Tenants', 'Email Templates', 'Webhooks',
    ];
    for (const tag of expected) {
      expect(tagNames).toContain(tag);
    }
  });
});

describe('DOCS-4 — Swagger UI serves HTML', () => {
  it('should return 200 with HTML containing swagger', async () => {
    const res = await request(app).get('/api-docs/').redirects(3);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text.toLowerCase()).toContain('swagger');
  });
});
