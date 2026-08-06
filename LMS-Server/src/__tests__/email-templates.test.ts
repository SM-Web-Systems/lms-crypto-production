/**
 * Tests for Phase 22 C3 — Email Template Management.
 *
 * ET-1  — seedEmailTemplates creates 3 default templates
 * ET-2  — renderTemplate replaces {{var}} with escaped values
 * ET-3  — renderTemplate replaces {{{var}}} with unescaped values (URLs)
 * ET-4  — updateTemplate bumps version number
 * ET-5  — GET /admin/email-templates returns template list
 * ET-6  — PUT /admin/email-templates/:slug updates template
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import {
  listTemplates,
  getTemplate,
  updateTemplate,
  renderTemplate,
} from '../services/emailTemplateService.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedAdmin(suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, wallet_linking_status)
    VALUES ('${userId}', 'Admin ${suffix}', '${suffix}@test.com', '${HASH}', 'admin', 'none');
  `);
  return userId;
}

describe('Email Templates (C3)', () => {
  let adminId: string;
  let adminToken: string;

  beforeEach(() => {
    adminId = seedAdmin('et-admin');
    adminToken = makeToken({ userId: adminId, email: 'et-admin@test.com', role: 'admin' });
  });

  // ET-1: seed creates 3 templates
  describe('ET-1: seed templates', () => {
    it('creates 3 default templates', () => {
      const templates = listTemplates();
      const slugs = templates.map((t) => t.slug).sort();
      expect(slugs).toContain('enrollment');
      expect(slugs).toContain('password-reset');
      expect(slugs).toContain('course-invitation');
      expect(templates.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ET-2: renderTemplate escapes {{var}}
  describe('ET-2: renderTemplate escapes double-brace variables', () => {
    it('escapes HTML in variable values', () => {
      const result = renderTemplate('enrollment', {
        studentName: '<script>alert("xss")</script>',
        courseName: 'Test & Course',
        lmsName: 'LMS',
        loginUrl: 'https://example.com/login',
      });

      expect(result).not.toBeNull();
      expect(result!.html).toContain('&lt;script&gt;');
      expect(result!.html).not.toContain('<script>');
      expect(result!.html).toContain('Test &amp; Course');
    });
  });

  // ET-3: renderTemplate doesn't escape {{{var}}}
  describe('ET-3: renderTemplate leaves triple-brace unescaped', () => {
    it('preserves URL in triple-brace variables', () => {
      const result = renderTemplate('enrollment', {
        studentName: 'Alice',
        courseName: 'Blockchain 101',
        lmsName: 'LMS',
        loginUrl: 'https://example.com/login?foo=bar&baz=1',
      });

      expect(result).not.toBeNull();
      expect(result!.html).toContain('href="https://example.com/login?foo=bar&baz=1"');
    });
  });

  // ET-4: updateTemplate bumps version
  describe('ET-4: updateTemplate bumps version', () => {
    it('increments version on update', () => {
      const before = getTemplate('enrollment');
      expect(before).toBeDefined();
      const v1 = before!.version;

      updateTemplate('enrollment', { subject: 'Updated subject', bodyHtml: '<p>Updated</p>' }, adminId);
      const after = getTemplate('enrollment');
      expect(after!.version).toBe(v1 + 1);
      expect(after!.subject).toBe('Updated subject');
    });
  });

  // ET-5: GET /admin/email-templates returns list
  describe('ET-5: GET /admin/email-templates', () => {
    it('returns template list', async () => {
      const res = await request(app)
        .get('/api/v1/admin/email-templates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.templates.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data.templates[0]).toHaveProperty('slug');
      expect(res.body.data.templates[0]).toHaveProperty('subject');
    });
  });

  // ET-6: PUT /admin/email-templates/:slug updates template
  describe('ET-6: PUT /admin/email-templates/:slug', () => {
    it('updates subject and body', async () => {
      const res = await request(app)
        .put('/api/v1/admin/email-templates/enrollment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subject: 'New Subject', bodyHtml: '<p>New body</p>' });

      expect(res.status).toBe(200);
      expect(res.body.data.subject).toBe('New Subject');
      expect(res.body.data.bodyHtml).toBe('<p>New body</p>');
      expect(res.body.data.version).toBeGreaterThan(1);
    });
  });
});
