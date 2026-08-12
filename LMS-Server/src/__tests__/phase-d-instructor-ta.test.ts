import { describe, it, expect } from 'vitest';
import './setup.js';
import { db } from '../config/database.js';

describe('D0: Schema — Tables + Columns', () => {
  it('D0-SCHEMA-1: course_tas table exists with correct columns', () => {
    const cols = db.pragma('table_info(course_tas)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('course_id');
    expect(colNames).toContain('user_id');
    expect(colNames).toContain('assigned_by');
    expect(colNames).toContain('assigned_at');
  });

  it('D0-SCHEMA-2: course_material_submissions table exists', () => {
    const cols = db.pragma('table_info(course_material_submissions)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('course_id');
    expect(colNames).toContain('submitter_id');
    expect(colNames).toContain('section_id');
    expect(colNames).toContain('item_title');
    expect(colNames).toContain('item_type');
    expect(colNames).toContain('content');
    expect(colNames).toContain('status');
  });

  it('D0-SCHEMA-3: submissions table has grade_status + graded_by columns', () => {
    const cols = db.pragma('table_info(submissions)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('grade_status');
    expect(colNames).toContain('graded_by');
  });
});
