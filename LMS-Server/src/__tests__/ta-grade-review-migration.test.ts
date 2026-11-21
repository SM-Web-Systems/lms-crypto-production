/**
 * UX-002 migration: proposed_status, ta_feedback and review_note on submissions.
 * Additive, idempotent, and safe on an existing database (no row or value lost).
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureTaGradeReviewColumns } from '../config/taGradeReviewMigration.js';

const newColumns = /\s*proposed_status TEXT[^\n]*\n\s*ta_feedback TEXT,\r?\n\s*review_note TEXT,/;
const schema = readFileSync(path.resolve('database/schema.sql'), 'utf8');
const preUpgradeSchema = schema.replace(newColumns, '');

function seed(db: Database.Database) {
  db.exec(`INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Sam', 'sam@example.invalid', 'h'), ('ta', 'Tom', 'tom@example.invalid', 'h');
    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES ('st1', 'u1', 'Sam', 'sam@example.invalid', 'E1', 'CS', 1);
    INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, feedback, grade_status, graded_by) VALUES
      ('pending', 'st1', 'A', 'd', 'a.pdf', 1, '/tmp/a', 'pending', 'TA wrote this', 'pending_approval', 'ta'),
      ('direct', 'st1', 'B', 'd', 'b.pdf', 1, '/tmp/b', 'rejected', 'Lecturer wrote this', 'direct', NULL),
      ('approved', 'st1', 'C', 'd', 'c.pdf', 1, '/tmp/c', 'approved', 'Approved TA feedback', 'approved', 'ta');`);
}
const rows = (db: Database.Database) =>
  db.prepare('SELECT id, status, feedback, grade_status, graded_by, ta_feedback, proposed_status, review_note FROM submissions ORDER BY id').all();
const expected = [
  { id: 'approved', status: 'approved', feedback: 'Approved TA feedback', grade_status: 'approved', graded_by: 'ta', ta_feedback: null, proposed_status: null, review_note: null },
  { id: 'direct', status: 'rejected', feedback: 'Lecturer wrote this', grade_status: 'direct', graded_by: null, ta_feedback: null, proposed_status: null, review_note: null },
  // A pending TA proposal's feedback moves out of the learner-visible column.
  { id: 'pending', status: 'pending', feedback: null, grade_status: 'pending_approval', graded_by: 'ta', ta_feedback: 'TA wrote this', proposed_status: null, review_note: null },
];

describe('ensureTaGradeReviewColumns', () => {
  it('the fixture really is the pre-upgrade schema', () => {
    expect(preUpgradeSchema).not.toBe(schema);
    const submissionsDdl = preUpgradeSchema.match(/CREATE TABLE IF NOT EXISTS submissions \([\s\S]*?\n\);/)![0];
    expect(submissionsDdl).not.toMatch(/ta_feedback|review_note|proposed_status/);
  });

  it('adds the columns, moves pending TA feedback, keeps every row, and is idempotent', () => {
    const db = new Database(':memory:');
    db.exec(preUpgradeSchema); seed(db);
    ensureTaGradeReviewColumns(db);
    expect(rows(db)).toEqual(expected);
    // A second run (every restart) changes nothing, even for rows written since.
    db.exec("UPDATE submissions SET feedback = 'new learner feedback' WHERE id = 'pending'");
    ensureTaGradeReviewColumns(db);
    expect(rows(db)).toEqual(expected.map(r => r.id === 'pending' ? { ...r, feedback: 'new learner feedback' } : r));
    expect(() => db.exec("UPDATE submissions SET proposed_status = 'maybe' WHERE id = 'pending'")).toThrow(/CHECK/);
    db.close();
  });

  it('is a no-op on the current schema', () => {
    const db = new Database(':memory:');
    db.exec(schema); seed(db);
    const before = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'submissions'").get();
    ensureTaGradeReviewColumns(db);
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'submissions'").get()).toEqual(before);
    expect(db.prepare("SELECT feedback, ta_feedback FROM submissions WHERE id = 'pending'").get())
      .toEqual({ feedback: 'TA wrote this', ta_feedback: null });
    db.close();
  });
});

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const runtime = `import('./src/config/database.ts').then(({db,close}) => {
  console.log(JSON.stringify(db.prepare('SELECT count(*) n FROM submissions').get())); close();
}).catch(error=>{console.error(error.message);process.exitCode=1});`;
function start(file: string) {
  const env = { ...process.env, DATABASE_PATH: file, NODE_ENV: 'production' };
  delete env.VITEST; delete env.VITEST_WORKER_ID; delete env.VITEST_POOL_ID;
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', runtime], { env, encoding: 'utf8', timeout: 30000, windowsHide: true });
}

describe('real startup on an existing pre-upgrade database', { timeout: 60000 }, () => {
  it('upgrades in place without data loss, and restarts cleanly', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ux002-db-')); directories.push(dir);
    const file = path.join(dir, 'existing.db');
    const db = new Database(file); db.exec(preUpgradeSchema); seed(db); db.close();

    for (let run = 0; run < 2; run++) {
      const result = start(file);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('{"n":3}');
    }
    const check = new Database(file, { readonly: true });
    try {
      expect(rows(check)).toEqual(expected);
      expect(check.prepare('SELECT count(*) n FROM users').get()).toEqual({ n: 2 });
    } finally { check.close(); }
  });
});
