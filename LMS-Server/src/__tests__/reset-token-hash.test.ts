import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-AUTH-005: Hash password reset tokens', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../controllers/authController.ts'), 'utf-8');

  it('should use SHA-256 hashing for reset tokens', () => {
    expect(src).toMatch(/createHash\s*\(\s*['"]sha256['"]\s*\)/);
  });

  it('should hash the token before storing in DB (forgotPassword)', () => {
    // The forgotPassword function should hash before INSERT/UPDATE
    const forgotBlock = src.slice(src.indexOf('forgotPassword'), src.indexOf('resetPassword'));
    expect(forgotBlock).toMatch(/createHash\s*\(\s*['"]sha256['"]\s*\)/);
  });

  it('should hash the incoming token before lookup (resetPassword)', () => {
    const resetBlock = src.slice(src.indexOf('resetPassword'));
    expect(resetBlock).toMatch(/createHash\s*\(\s*['"]sha256['"]\s*\)/);
  });
});
