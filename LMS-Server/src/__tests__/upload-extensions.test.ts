/**
 * UPLOAD-EXT-2 — Item type mapping for new MIME types.
 * UPLOAD-EXT-3 — Markdown sanitization.
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';

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
