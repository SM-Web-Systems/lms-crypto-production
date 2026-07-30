import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-MINT-J2-004 — mint credential insert wrapped in transaction', () => {
  it('nftApplications.ts mint endpoint should use db.transaction()', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../routes/nftApplications.ts'), 'utf-8');
    expect(src).toMatch(/\.transaction\(/);
  });
});
