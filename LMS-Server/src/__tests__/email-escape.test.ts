import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-EMAIL-001: HTML-escape email templates', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../services/emailService.ts'), 'utf-8');

  it('should have an escapeHtml function', () => {
    expect(src).toMatch(/function escapeHtml/);
  });

  it('should not use unescaped ${name} in HTML templates', () => {
    // In HTML template strings, name/courseName/LMS_NAME should be wrapped with escapeHtml()
    // Find all template literal html assignments and check for raw ${name}, ${courseName}, ${LMS_NAME}
    const htmlBlocks = src.match(/const html = `[\s\S]*?`\.trim\(\)/g) ?? [];
    for (const block of htmlBlocks) {
      // Should not have raw ${name} — should be ${escapeHtml(name)}
      expect(block).not.toMatch(/\$\{name\}/);
      expect(block).not.toMatch(/\$\{courseName\}/);
      expect(block).not.toMatch(/\$\{LMS_NAME\}/);
    }
  });
});
