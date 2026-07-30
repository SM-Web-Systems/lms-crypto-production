/**
 * LMS-RATE-003 — Trust proxy production warning exists in source.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const appSource = fs.readFileSync(
  path.resolve(__dirname, '../app.ts'),
  'utf-8',
);

describe('LMS-RATE-003 — trust proxy production warning', () => {
  it('warns when NODE_ENV=production and TRUST_PROXY is not set', () => {
    expect(appSource).toContain(
      'NODE_ENV=production but TRUST_PROXY is not set',
    );
  });
});
