import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-AUTH-001: JWT secret security', () => {
  it('should not contain hardcoded insecure fallback secret', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../config/jwt.ts'), 'utf-8');
    expect(src).not.toContain('dev-only-insecure-secret');
  });

  it('should throw if JWT_SECRET is missing regardless of NODE_ENV', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../config/jwt.ts'), 'utf-8');
    // Must NOT have a conditional that only checks production
    expect(src).not.toMatch(/NODE_ENV\s*===\s*['"]production['"]/);
    // Must have unconditional throw
    expect(src).toMatch(/if\s*\(\s*!process\.env\.JWT_SECRET\s*\)/);
  });
});
