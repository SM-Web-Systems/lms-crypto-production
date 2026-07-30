/**
 * LMS-MINT-J2-006 — Public credentials route has a rate limiter.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const appSource = fs.readFileSync(
  path.resolve(__dirname, '../app.ts'),
  'utf-8',
);

describe('LMS-MINT-J2-006 — public credentials rate limit', () => {
  it('publicCredentialsRoutes is mounted with a limiter', () => {
    // Should have readLimiter (or any limiter) before publicCredentialsRoutes
    expect(appSource).toMatch(/readLimiter.*publicCredentialsRoutes|apiLimiter.*publicCredentialsRoutes/);
  });
});
