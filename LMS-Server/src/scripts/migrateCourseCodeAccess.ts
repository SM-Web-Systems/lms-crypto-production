/**
 * Migration: course-code-based access (BACKEND_COURSE_CODE_ACCESS.md).
 * - Adds courses.course_code, backfills from id.
 * - Adds course_documents.course_ids.
 * - Creates user_course_codes; backfills from course_enrollments.
 * Safe to run multiple times.
 */

import dotenv from 'dotenv';
dotenv.config();

import { db, close } from '../config/database.js';

function hasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function tableExists(name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

try {
  // 1. courses.course_code
  if (!hasColumn('courses', 'course_code')) {
    db.exec('ALTER TABLE courses ADD COLUMN course_code TEXT');
    const rows = db.prepare('SELECT id FROM courses').all() as Array<{ id: string }>;
    const update = db.prepare('UPDATE courses SET course_code = ? WHERE id = ?');
    for (const r of rows) {
      const code = 'COURSE-' + r.id.replace(/-/g, '').toUpperCase().slice(0, 24);
      update.run(code, r.id);
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_course_code ON courses(course_code)');
    console.log('Added and backfilled courses.course_code');
  } else {
    console.log('courses.course_code already exists');
  }

  // 2. course_documents.course_ids
  if (!hasColumn('course_documents', 'course_ids')) {
    db.exec('ALTER TABLE course_documents ADD COLUMN course_ids TEXT');
    console.log('Added course_documents.course_ids');
  } else {
    console.log('course_documents.course_ids already exists');
  }

  // 3. user_course_codes table
  if (!tableExists('user_course_codes')) {
    db.exec(`
      CREATE TABLE user_course_codes (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_code TEXT NOT NULL,
        PRIMARY KEY (user_id, course_code)
      );
      CREATE INDEX idx_user_course_codes_user ON user_course_codes(user_id);
      CREATE INDEX idx_user_course_codes_code ON user_course_codes(course_code);
    `);
    console.log('Created user_course_codes table');
  }

  // 4. Backfill user_course_codes from course_enrollments (if table exists)
  if (tableExists('course_enrollments')) {
    const enrollments = db
      .prepare(
        `SELECT e.user_id, c.course_code
         FROM course_enrollments e
         JOIN courses c ON c.id = e.course_id
         WHERE c.course_code IS NOT NULL AND c.course_code != ''`
      )
      .all() as Array<{ user_id: string; course_code: string }>;
    const insert = db.prepare(
      'INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)'
    );
    for (const row of enrollments) {
      insert.run(row.user_id, row.course_code);
    }
    if (enrollments.length > 0) console.log('Backfilled user_course_codes from course_enrollments');
  }
} finally {
  close();
}
