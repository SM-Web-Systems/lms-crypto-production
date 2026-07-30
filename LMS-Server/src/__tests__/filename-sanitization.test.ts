import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-INPUT-005: Content-Disposition filename sanitization', () => {
  for (const file of ['submissionsController.ts', 'documentsController.ts']) {
    it(`${file} should not use raw .file_name in Content-Disposition`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, `../controllers/${file}`), 'utf-8');
      // Should NOT have: filename="${submission.file_name}" or "${document.file_name}"
      expect(src).not.toMatch(/filename="\$\{(?:submission|document)\.file_name\}"/);
    });

    it(`${file} should have a safeName helper`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, `../controllers/${file}`), 'utf-8');
      expect(src).toContain('function safeName');
    });
  }
});
