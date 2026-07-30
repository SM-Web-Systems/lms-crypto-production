import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LMS-INPUT-003: JSON body limit', () => {
  it('express.json() should have an explicit limit option', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app.ts'), 'utf-8');
    // Must have express.json({ ... limit: ... })
    expect(src).toMatch(/express\.json\(\s*\{[^}]*limit\s*:/);
  });

  it('should not have express.json() without options', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app.ts'), 'utf-8');
    // Must NOT have bare express.json()
    expect(src).not.toMatch(/express\.json\(\s*\)/);
  });
});
