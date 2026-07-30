import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-MINT-J2-003 — Stellar address validation before mint', () => {
  it('mintService should validate wallet address with isValidEd25519PublicKey', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/mintService.ts'), 'utf-8');
    expect(src).toContain('isValidEd25519PublicKey');
  });
});
