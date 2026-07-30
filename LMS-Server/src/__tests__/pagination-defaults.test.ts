import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-PAGINATION-001 — pagination on list endpoints', () => {
  for (const file of ['forumController.ts', 'messagesController.ts', 'announcementsController.ts']) {
    it(`${file} should have LIMIT/OFFSET pagination`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, `../controllers/${file}`), 'utf-8');
      expect(src).toMatch(/LIMIT\s*\?/i);
    });
  }
});
