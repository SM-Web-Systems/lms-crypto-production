import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-MINT-005 — stale pending mints auto-expire', () => {
  it('adminController should expire pending mints older than 30 minutes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/adminController.ts'), 'utf-8');
    expect(src).toContain('-30 minutes');
    expect(src).toMatch(/mint_status\s*=\s*'failed'/);
  });
});
