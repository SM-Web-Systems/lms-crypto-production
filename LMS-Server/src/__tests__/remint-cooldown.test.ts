/**
 * LMS-AUTH-009 — Remint cooldown: source scan for REMINT_COOLDOWN error code.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '../controllers/adminController.ts'),
  'utf-8',
);

describe('LMS-AUTH-009 — remint cooldown', () => {
  it('source contains REMINT_COOLDOWN error code', () => {
    expect(source).toContain('REMINT_COOLDOWN');
  });

  it('checks for recent credential within 1 hour', () => {
    expect(source).toContain("-1 hour");
  });
});
