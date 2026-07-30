import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-SQLI-002: Profile column allowlist', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../controllers/profileController.ts'), 'utf-8');

  it('should define ALLOWED_PROFILE_COLUMNS', () => {
    expect(src).toContain('ALLOWED_PROFILE_COLUMNS');
  });

  it('should validate profile fields against the allowlist', () => {
    expect(src).toMatch(/ALLOWED_PROFILE_COLUMNS\.has/);
  });
});
