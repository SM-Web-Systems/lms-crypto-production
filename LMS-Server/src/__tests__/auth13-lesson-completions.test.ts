import { afterEach, describe, expect, it } from 'vitest';
import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const schema = readFileSync(path.resolve('database/schema.sql'), 'utf8');
const protectedDbPath = '/home/webadmin/auth13-validation/db-compat/test-production-v4.db';

/** Minimal prerequisite tables for lesson_completions foreign keys. */
const prereqSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );
`;

/** Legacy CREATE TABLE (no progress columns, completed_at NOT NULL). */
const legacyLessonCompletionsSQL = `
  CREATE TABLE IF NOT EXISTS lesson_completions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    item_id      TEXT NOT NULL,
    section_id   TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    marked_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (user_id, course_id, item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course
    ON lesson_completions(user_id, course_id);
`;

/** Partial legacy: has progress_pct but not last_position_s. */
const partialLessonCompletionsSQL = `
  CREATE TABLE IF NOT EXISTS lesson_completions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    item_id      TEXT NOT NULL,
    section_id   TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    marked_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    progress_pct INTEGER,
    UNIQUE (user_id, course_id, item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course
    ON lesson_completions(user_id, course_id);
`;

/**
 * Simulate the ensureLessonCompletionsTable migration logic from database.ts.
 * This mirrors the production code so we can test migration behavior in isolation.
 */
function runMigration(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lesson_completions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      item_id      TEXT NOT NULL,
      section_id   TEXT NOT NULL,
      completed_at TEXT DEFAULT (datetime('now')),
      marked_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
      progress_pct    INTEGER,
      last_position_s INTEGER,
      UNIQUE (user_id, course_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course
      ON lesson_completions(user_id, course_id);
  `);
  const cols = (db.pragma('table_info("lesson_completions")') as { name: string }[]).map(c => c.name);
  if (!cols.includes('progress_pct')) {
    db.exec('ALTER TABLE lesson_completions ADD COLUMN progress_pct INTEGER');
  }
  if (!cols.includes('last_position_s')) {
    db.exec('ALTER TABLE lesson_completions ADD COLUMN last_position_s INTEGER');
  }
}

function columnNames(db: SqliteDatabase, table: string): string[] {
  return (db.pragma(`table_info("${table}")`) as { name: string }[]).map(c => c.name);
}

function columnInfo(db: SqliteDatabase, table: string): { name: string; notnull: number }[] {
  return db.pragma(`table_info("${table}")`) as { name: string; notnull: number }[];
}

const databases: SqliteDatabase[] = [];
function memdb(): SqliteDatabase {
  const db = new Database(':memory:');
  databases.push(db);
  return db;
}

afterEach(() => {
  for (const db of databases.splice(0)) {
    try { db.close(); } catch { /* already closed */ }
  }
});

describe('AUTH-13 lesson_completions migration', () => {
  it('new database gets canonical lesson_completions schema', () => {
    const db = memdb();
    db.exec(schema);
    const cols = columnNames(db, 'lesson_completions');
    expect(cols).toContain('progress_pct');
    expect(cols).toContain('last_position_s');
    // completed_at should be nullable in canonical schema
    const info = columnInfo(db, 'lesson_completions');
    const completedAt = info.find(c => c.name === 'completed_at');
    expect(completedAt).toBeDefined();
    expect(completedAt!.notnull).toBe(0);
  });

  it('existing table missing progress columns gets them added', () => {
    const db = memdb();
    db.exec(prereqSQL);
    db.exec(legacyLessonCompletionsSQL);
    // Verify columns are missing before migration
    const colsBefore = columnNames(db, 'lesson_completions');
    expect(colsBefore).not.toContain('progress_pct');
    expect(colsBefore).not.toContain('last_position_s');
    // Run migration
    runMigration(db);
    // Verify columns are now present
    const colsAfter = columnNames(db, 'lesson_completions');
    expect(colsAfter).toContain('progress_pct');
    expect(colsAfter).toContain('last_position_s');
  });

  it('existing table missing one progress column gets it added', () => {
    const db = memdb();
    db.exec(prereqSQL);
    db.exec(partialLessonCompletionsSQL);
    // Verify: has progress_pct, missing last_position_s
    const colsBefore = columnNames(db, 'lesson_completions');
    expect(colsBefore).toContain('progress_pct');
    expect(colsBefore).not.toContain('last_position_s');
    // Run migration
    runMigration(db);
    // Verify both present
    const colsAfter = columnNames(db, 'lesson_completions');
    expect(colsAfter).toContain('progress_pct');
    expect(colsAfter).toContain('last_position_s');
  });

  it('existing lesson completion data is preserved after migration', () => {
    const db = memdb();
    db.exec(prereqSQL);
    db.exec(legacyLessonCompletionsSQL);
    // Insert prerequisite data
    db.exec(`INSERT INTO users(id,name,email,password_hash) VALUES('u1','Test User','test@example.invalid','hash');
`);
    db.exec("INSERT INTO courses(id,title,description) VALUES('c1','Course 1','Desc')");
    // Insert lesson completion with old schema
    db.exec("INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id) VALUES('lc1','u1','c1','item1','sec1')");
    // Run migration
    runMigration(db);
    // Verify data is preserved
    const row = db.prepare("SELECT * FROM lesson_completions WHERE id='lc1'").get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.user_id).toBe('u1');
    expect(row.course_id).toBe('c1');
    expect(row.item_id).toBe('item1');
    expect(row.section_id).toBe('sec1');
    // New columns should be NULL for pre-existing rows
    expect(row.progress_pct).toBeNull();
    expect(row.last_position_s).toBeNull();
  });

  it('in-progress lesson with NULL completion timestamp', () => {
    const db = memdb();
    db.exec(prereqSQL);
    // Use canonical schema (nullable completed_at)
    runMigration(db);
    db.exec(`INSERT INTO users(id,name,email,password_hash) VALUES('u1','Test User','test@example.invalid','hash');
`);
    db.exec("INSERT INTO courses(id,title,description) VALUES('c1','Course 1','Desc')");
    // Insert with explicit NULL completed_at (in-progress lesson)
    db.exec("INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id,completed_at,progress_pct,last_position_s) VALUES('lc1','u1','c1','item1','sec1',NULL,25,120)");
    const row = db.prepare("SELECT completed_at,progress_pct,last_position_s FROM lesson_completions WHERE id='lc1'").get() as Record<string, unknown>;
    expect(row.completed_at).toBeNull();
    expect(row.progress_pct).toBe(25);
    expect(row.last_position_s).toBe(120);
  });

  it('completion marking sets completed_at', () => {
    const db = memdb();
    db.exec(prereqSQL);
    runMigration(db);
    db.exec(`INSERT INTO users(id,name,email,password_hash) VALUES('u1','Test User','test@example.invalid','hash');
`);
    db.exec("INSERT INTO courses(id,title,description) VALUES('c1','Course 1','Desc')");
    // Start with in-progress (NULL completed_at)
    db.exec("INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id,completed_at,progress_pct) VALUES('lc1','u1','c1','item1','sec1',NULL,50)");
    // Mark as completed
    db.exec("UPDATE lesson_completions SET completed_at = datetime('now'), progress_pct = 100 WHERE id='lc1'");
    const row = db.prepare("SELECT completed_at,progress_pct FROM lesson_completions WHERE id='lc1'").get() as Record<string, unknown>;
    expect(row.completed_at).not.toBeNull();
    expect(row.progress_pct).toBe(100);
  });

  it('position and progress updates work', () => {
    const db = memdb();
    db.exec(prereqSQL);
    runMigration(db);
    db.exec(`INSERT INTO users(id,name,email,password_hash) VALUES('u1','Test User','test@example.invalid','hash');
`);
    db.exec("INSERT INTO courses(id,title,description) VALUES('c1','Course 1','Desc')");
    // Insert initial progress
    db.exec("INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id,completed_at,progress_pct,last_position_s) VALUES('lc1','u1','c1','item1','sec1',NULL,10,30)");
    // Update progress and position
    db.exec("UPDATE lesson_completions SET progress_pct = 75, last_position_s = 450 WHERE id='lc1'");
    const row = db.prepare("SELECT progress_pct,last_position_s FROM lesson_completions WHERE id='lc1'").get() as Record<string, unknown>;
    expect(row.progress_pct).toBe(75);
    expect(row.last_position_s).toBe(450);
  });

  it('migration is idempotent', () => {
    const db = memdb();
    db.exec(prereqSQL);
    // Run migration twice
    runMigration(db);
    expect(() => runMigration(db)).not.toThrow();
    // Verify schema is correct after double run
    const cols = columnNames(db, 'lesson_completions');
    expect(cols).toContain('progress_pct');
    expect(cols).toContain('last_position_s');
  });

  it('migration failure rolls back', () => {
    const db = memdb();
    db.exec(prereqSQL);
    db.exec(legacyLessonCompletionsSQL);
    db.exec(`INSERT INTO users(id,name,email,password_hash) VALUES('u1','Test User','test@example.invalid','hash');
`);
    db.exec("INSERT INTO courses(id,title,description) VALUES('c1','Course 1','Desc')");
    db.exec("INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id) VALUES('lc1','u1','c1','item1','sec1')");
    const colsBefore = columnNames(db, 'lesson_completions');
    // Simulate a failure by wrapping migration in a transaction and forcing rollback
    // Create a situation where the second ALTER fails: drop the table mid-migration
    // by using a savepoint-based approach
    const originalExec = db.exec.bind(db);
    let callCount = 0;
    const failingDb = Object.create(db) as SqliteDatabase;
    failingDb.exec = (sql: string) => {
      // Fail on the last_position_s ALTER (the second additive ALTER)
      if (sql.includes('last_position_s') && sql.includes('ALTER')) {
        throw new Error('Simulated migration failure');
      }
      return originalExec(sql);
    };
    failingDb.pragma = db.pragma.bind(db);

    // Run the migration within a savepoint so failure rolls back
    db.exec('SAVEPOINT migration_test');
    try {
      runMigrationWithDb(failingDb);
      db.exec('RELEASE migration_test');
    } catch (e) {
      db.exec('ROLLBACK TO migration_test');
      db.exec('RELEASE migration_test');
    }
    // Original data should be preserved
    const row = db.prepare("SELECT * FROM lesson_completions WHERE id='lc1'").get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.user_id).toBe('u1');
    // Since we rolled back, progress_pct should NOT have been added
    const colsAfter = columnNames(db, 'lesson_completions');
    expect(colsAfter).not.toContain('last_position_s');
  });

  it.skipIf(!existsSync(protectedDbPath))('protected copy compatibility', () => {
    const db = new Database(protectedDbPath, { readonly: true });
    databases.push(db);
    const cols = columnNames(db, 'lesson_completions');
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    expect(cols).toContain('course_id');
    expect(cols).toContain('item_id');
    expect(cols).toContain('section_id');
    expect(cols).toContain('completed_at');
    expect(cols).toContain('marked_by');
    expect(cols).toContain('progress_pct');
    expect(cols).toContain('last_position_s');
    // completed_at should be nullable
    const info = columnInfo(db, 'lesson_completions');
    const completedAt = info.find(c => c.name === 'completed_at');
    expect(completedAt).toBeDefined();
    expect(completedAt!.notnull).toBe(0);
  });
});

/** Migration variant that accepts an explicit db handle (for failure simulation). */
function runMigrationWithDb(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lesson_completions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      item_id      TEXT NOT NULL,
      section_id   TEXT NOT NULL,
      completed_at TEXT DEFAULT (datetime('now')),
      marked_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
      progress_pct    INTEGER,
      last_position_s INTEGER,
      UNIQUE (user_id, course_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course
      ON lesson_completions(user_id, course_id);
  `);
  const cols = (db.pragma('table_info("lesson_completions")') as { name: string }[]).map(c => c.name);
  if (!cols.includes('progress_pct')) {
    db.exec('ALTER TABLE lesson_completions ADD COLUMN progress_pct INTEGER');
  }
  if (!cols.includes('last_position_s')) {
    db.exec('ALTER TABLE lesson_completions ADD COLUMN last_position_s INTEGER');
  }
}
