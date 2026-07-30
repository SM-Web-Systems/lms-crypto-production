import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-DB-007 — clerk_user_id index gated', () => {
  it('CREATE INDEX for clerk_user_id should be inside column-existence check', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../config/database.ts'), 'utf-8');
    const lines = src.split('\n');
    let insideIf = false;
    let indexInsideIf = false;
    let braceDepth = 0;
    for (const line of lines) {
      if (line.includes('!cols.some') && line.includes('clerk_user_id')) {
        insideIf = true;
        braceDepth = 0;
      }
      if (insideIf) {
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;
        if (line.includes('idx_users_clerk_user_id')) indexInsideIf = true;
        if (braceDepth <= 0 && line.trim().startsWith('}')) {
          insideIf = false;
        }
      }
    }
    expect(indexInsideIf).toBe(true);
  });
});
