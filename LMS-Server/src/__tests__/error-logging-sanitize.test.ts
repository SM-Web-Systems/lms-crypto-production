import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-ERR-004/005: Sanitize error logging', () => {
  it('authController should not log raw wallet error messages', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/authController.ts'), 'utf-8');
    // Should NOT have: e?.message ?? String(err)
    expect(src).not.toMatch(/e\?\.\s*message\s*\?\?\s*String\(err\)/);
    // Should have: e?.code
    expect(src).toMatch(/e\?\.\s*code/);
  });

  it('adminController should not log raw error objects', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/adminController.ts'), 'utf-8');
    // Should NOT have: error:`, error) — passing raw error as extra arg
    expect(src).not.toMatch(/\[adminDiag\].*error:`,\s*error\)/);
  });
});
