import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-MINT-002 — idempotent credential insert via transaction', () => {
  it('remint should use db.transaction() for atomicity', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/adminController.ts'), 'utf-8');
    expect(src).toMatch(/\.transaction\(/);
  });
});
