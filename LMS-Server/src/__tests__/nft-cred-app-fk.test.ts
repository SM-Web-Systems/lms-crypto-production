import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-DB-002 — nft_credentials.application_id FK in schema.sql', () => {
  it('schema.sql should declare application_id with REFERENCES course_nft_applications(id)', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf-8');
    expect(schema).toMatch(/application_id\s+TEXT\s+REFERENCES\s+course_nft_applications\s*\(\s*id\s*\)/i);
  });
});
