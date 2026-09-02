import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, 'icon-resolver.ts'),
  'utf-8'
);

describe('icon-resolver size guard (source assertion)', () => {
  it('defines MAX_ICON_SIZE constant', () => {
    expect(SRC).toContain('MAX_ICON_SIZE');
  });

  it('sets MAX_ICON_SIZE to 512KB (524288 bytes)', () => {
    // Accept either the expression or the literal
    const hasExpression = SRC.includes('512 * 1024');
    const hasLiteral = SRC.includes('524288');
    expect(hasExpression || hasLiteral).toBe(true);
  });

  it('checks Content-Length header against MAX_ICON_SIZE', () => {
    // Should read content-length and compare to MAX_ICON_SIZE
    const hasContentLength = /content-length/i.test(SRC);
    const comparesSize = SRC.includes('MAX_ICON_SIZE');
    expect(hasContentLength && comparesSize).toBe(true);
  });

  it('checks actual buffer length against MAX_ICON_SIZE', () => {
    // After downloading, buffer.length or buf.length should be checked
    const checksBuffer =
      SRC.includes('buffer.length > MAX_ICON_SIZE') ||
      SRC.includes('buf.length > MAX_ICON_SIZE') ||
      SRC.includes('buffer.length >= MAX_ICON_SIZE') ||
      SRC.includes('buf.length >= MAX_ICON_SIZE');
    expect(checksBuffer).toBe(true);
  });

  it('applies size checks in both download paths', () => {
    // There should be at least 2 occurrences of MAX_ICON_SIZE comparisons
    const matches = SRC.match(/MAX_ICON_SIZE/g) || [];
    // constant definition + at least 4 checks (2 content-length + 2 buffer)
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});
