/**
 * LMS-SSO-002 — SSO state secret must not fall back to JWT_SECRET.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '../services/ammaWalletSSOService.ts'),
  'utf-8',
);

describe('LMS-SSO-002 — no JWT_SECRET fallback in SSO service', () => {
  it('does not reference process.env.JWT_SECRET', () => {
    expect(source).not.toContain('process.env.JWT_SECRET');
  });

  it('uses AMMA_SSO_STATE_SECRET only', () => {
    expect(source).toContain('process.env.AMMA_SSO_STATE_SECRET');
  });
});
