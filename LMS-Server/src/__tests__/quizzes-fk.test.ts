import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LMS-DB-001 — quizzes.course_id FK constraint', () => {
  it('schema.sql should declare quizzes.course_id with REFERENCES courses(id)', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf-8');
    // Find the quizzes CREATE TABLE block
    const quizzesMatch = schema.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+quizzes\s*\([\s\S]*?\);/im);
    expect(quizzesMatch).not.toBeNull();
    const quizzesBlock = quizzesMatch![0];
    expect(quizzesBlock).toMatch(/course_id\s+TEXT\s+REFERENCES\s+courses\s*\(\s*id\s*\)/i);
  });

  it('database.ts should have ensureQuizzesCourseIdFK function', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../config/database.ts'), 'utf-8');
    expect(src).toContain('ensureQuizzesCourseIdFK');
  });
});
