/**
 * LMS-RATE-002 — Read rate limiter exists and is applied to user routes.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const appSource = fs.readFileSync(
  path.resolve(__dirname, '../app.ts'),
  'utf-8',
);

describe('LMS-RATE-002 — read rate limiter', () => {
  it('defines a readLimiter constant', () => {
    expect(appSource).toContain('const readLimiter = rateLimit(');
  });

  it('applies readLimiter to usersRoutes', () => {
    expect(appSource).toMatch(/app\.use\(.*users.*readLimiter|readLimiter.*usersRoutes/);
  });
});
