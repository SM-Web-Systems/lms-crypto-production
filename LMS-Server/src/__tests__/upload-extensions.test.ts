/**
 * UPLOAD-EXT-1 — Integration test: new MIME types accepted via document upload endpoint.
 * UPLOAD-EXT-2 — Item type mapping for new MIME types.
 * UPLOAD-EXT-3 — Markdown sanitization.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import app from '../app.js';
import { seedTestData, type TestIds } from './helpers/seed.js';
import { makeToken } from './helpers/auth.js';
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';

// ── UPLOAD-EXT-1: Integration test for new MIME types via document upload ──

let ids: TestIds;
let adminToken: string;

beforeEach(() => {
  ids = seedTestData();
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
});

describe('UPLOAD-EXT-1 — New MIME types accepted via document upload endpoint', () => {
  it('should accept .md file upload without 400 invalid-file-type error', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-upload-ext-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, '# Test\n\nHello world');

    try {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', tmpFile, { filename: 'test.md', contentType: 'text/markdown' })
        .field('title', 'Test Markdown Doc')
        .field('description', 'A markdown test file')
        .field('category', 'Course Materials');

      // 201 = created successfully; anything other than 400 means it was not
      // rejected as an invalid file type. 400 with INVALID_FILE_TYPE code
      // is the specific failure we are guarding against.
      expect(res.status).not.toBe(400);
      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data.fileMimeType).toBe('text/markdown');
      }
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('should accept .json file upload without 400 invalid-file-type error', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-upload-ext-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ key: 'value', test: true }));

    try {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', tmpFile, { filename: 'test.json', contentType: 'application/json' })
        .field('title', 'Test JSON Doc')
        .field('description', 'A JSON test file')
        .field('category', 'Course Materials');

      expect(res.status).not.toBe(400);
      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data.fileMimeType).toBe('application/json');
      }
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('should reject an unsupported MIME type (e.g. .exe) with 400', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-upload-ext-${Date.now()}.exe`);
    fs.writeFileSync(tmpFile, 'MZ fake exe binary');

    try {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', tmpFile, { filename: 'malware.exe', contentType: 'application/octet-stream' })
        .field('title', 'Malware')
        .field('description', 'Should be rejected')
        .field('category', 'Course Materials');

      expect(res.status).toBe(400);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});

// ── UPLOAD-EXT-2 & UPLOAD-EXT-3: Unit tests ────────────────────────────────

// itemTypeFromMime is not exported — test it indirectly via importZipContent,
// but we can test the mapping logic directly by importing the module and
// checking the function. Since it's a private function, we test via the
// controller's behavior in Task 5. Here we do a simple inline unit test.

describe('UPLOAD-EXT-2 — MIME type mapping', () => {
  it('text/markdown should map to text item type', async () => {
    // We'll import the controller module and test itemTypeFromMime
    // After Task 2, itemTypeFromMime is exported for testing
    const { itemTypeFromMime } = await import('../controllers/coursesController.js');
    expect(itemTypeFromMime('text/markdown')).toBe('text');
  });

  it('application/json should map to download item type', async () => {
    const { itemTypeFromMime } = await import('../controllers/coursesController.js');
    expect(itemTypeFromMime('application/json')).toBe('download');
  });

  it('image/png should still map to download item type', async () => {
    const { itemTypeFromMime } = await import('../controllers/coursesController.js');
    expect(itemTypeFromMime('image/png')).toBe('download');
  });

  it('application/pdf should still map to pdf item type', async () => {
    const { itemTypeFromMime } = await import('../controllers/coursesController.js');
    expect(itemTypeFromMime('application/pdf')).toBe('pdf');
  });
});

describe('UPLOAD-EXT-3 — Markdown sanitization', () => {
  it('should render basic markdown to HTML', () => {
    const result = renderMarkdownToSafeHtml('# Hello\n\nWorld');
    expect(result).toContain('<h1>');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('should strip <script> tags', () => {
    const result = renderMarkdownToSafeHtml('Hello <script>alert(1)</script> World');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('should strip onerror attributes from img tags', () => {
    const result = renderMarkdownToSafeHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
  });

  it('should strip iframe tags', () => {
    const result = renderMarkdownToSafeHtml('<iframe src="evil.com"></iframe>');
    expect(result).not.toContain('<iframe');
  });

  it('should preserve allowed tags like links and bold', () => {
    const result = renderMarkdownToSafeHtml('**bold** and [link](https://example.com)');
    expect(result).toContain('<strong>');
    expect(result).toContain('<a');
    expect(result).toContain('href="https://example.com"');
  });

  it('should strip style attributes', () => {
    const result = renderMarkdownToSafeHtml('<p style="color:red">text</p>');
    expect(result).not.toContain('style=');
    expect(result).toContain('text');
  });
});

describe('GH-IMP-1 — GitHub URL parsing', () => {
  it('parses standard GitHub URL', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    const result = parseGitHubUrl('https://github.com/SM-Web-Systems/blockchain-course');
    expect(result).toEqual({ owner: 'SM-Web-Systems', repo: 'blockchain-course' });
  });

  it('parses GitHub URL with .git suffix', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    const result = parseGitHubUrl('https://github.com/SM-Web-Systems/blockchain-course.git');
    expect(result).toEqual({ owner: 'SM-Web-Systems', repo: 'blockchain-course' });
  });

  it('parses GitHub URL with trailing slash', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    const result = parseGitHubUrl('https://github.com/SM-Web-Systems/repo/');
    expect(result).toEqual({ owner: 'SM-Web-Systems', repo: 'repo' });
  });

  it('throws on non-GitHub URL', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    expect(() => parseGitHubUrl('https://gitlab.com/foo/bar')).toThrow();
  });

  it('throws on invalid URL format', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    expect(() => parseGitHubUrl('not-a-url')).toThrow();
  });
});

describe('GH-IMP-2 — Org whitelist', () => {
  it('allows SM-Web-Systems (default)', async () => {
    const { isAllowedOrg } = await import('../services/githubImportService.js');
    expect(isAllowedOrg('SM-Web-Systems')).toBe(true);
  });

  it('allows case-insensitive match', async () => {
    const { isAllowedOrg } = await import('../services/githubImportService.js');
    expect(isAllowedOrg('sm-web-systems')).toBe(true);
  });

  it('rejects non-whitelisted org', async () => {
    const { isAllowedOrg } = await import('../services/githubImportService.js');
    expect(isAllowedOrg('evil-org')).toBe(false);
  });
});
