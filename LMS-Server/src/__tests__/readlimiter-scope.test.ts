/**
 * LOCKOUT-LMS-001 — readLimiter must be scoped to /verify/* only.
 * LOCKOUT-LMS-002 — ogPages routes must still be rate-limited.
 *
 * Regression test: app.use(readLimiter, ogPagesRoutes) without a path prefix
 * caused the 120/15min readLimiter to apply to ALL requests, blocking normal
 * admin usage after ~120 requests in any 15-minute window.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const appSource = fs.readFileSync(
  path.resolve(__dirname, '../app.ts'),
  'utf-8',
);

describe('LOCKOUT-LMS-001 — readLimiter is scoped, not global', () => {
  it('does NOT mount readLimiter without a path prefix', () => {
    // The bug: app.use(readLimiter, ogPagesRoutes) applies readLimiter to ALL routes.
    // Fixed: app.use('/verify', readLimiter, ogPagesRoutes) scopes it.
    const globalMount = /app\.use\(\s*readLimiter\s*,\s*ogPagesRoutes\s*\)/;
    expect(appSource).not.toMatch(globalMount);
  });

  it('mounts readLimiter with /verify path prefix for ogPages', () => {
    // readLimiter should only apply to /verify/* (ogPages certificate verification)
    const scopedMount = /app\.use\(\s*['"]\/verify['"]\s*,\s*readLimiter\s*,\s*ogPagesRoutes\s*\)/;
    expect(appSource).toMatch(scopedMount);
  });
});

describe('LOCKOUT-LMS-002 — ogPages route uses relative path', () => {
  it('ogPages.ts route is /:credentialId (not /verify/:credentialId)', () => {
    const ogSource = fs.readFileSync(
      path.resolve(__dirname, '../routes/ogPages.ts'),
      'utf-8',
    );
    // When mounted at /verify, the route inside must be /:credentialId
    expect(ogSource).toContain("'/:credentialId'");
    // Must NOT contain the old /verify/:credentialId (would double the prefix)
    expect(ogSource).not.toContain("'/verify/:credentialId'");
  });
});
