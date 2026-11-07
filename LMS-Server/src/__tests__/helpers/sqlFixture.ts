import fs from 'node:fs';
import type { Database } from 'better-sqlite3';

// Test-fixture construction only. Never normalize or weaken production DDL validation.
export function normalizeSqlFixture(sql: string): string {
  return sql.replace(/\r\n/g, '\n');
}

export function readSqlFixture(file: string): string {
  return normalizeSqlFixture(fs.readFileSync(file, 'utf-8'));
}

/** Preserve exact fixture mutations while accepting either checkout newline style. */
export function mutateSqlFixture(sql: string, find: string, replacement: string): string {
  const normalized = normalizeSqlFixture(sql);
  const needle = normalizeSqlFixture(find);
  if (!needle || !normalized.includes(needle)) throw new Error(`Fixture pattern not found: ${find}`);
  const result = normalized.replace(needle, normalizeSqlFixture(replacement));
  if (result === normalized) throw new Error('Fixture mutation did not change the schema');
  return result;
}

/** Exercise real SQLite parsing/classification with both newline styles in CI. */
export function fixtureSqlForDatabase(sql: string, style = process.env.LMS_FIXTURE_LINE_ENDINGS || 'lf'): string {
  if (style !== 'lf' && style !== 'crlf') throw new Error(`Unsupported fixture newline style: ${style}`);
  const normalized = normalizeSqlFixture(sql);
  return style === 'crlf' ? normalized.replace(/\n/g, '\r\n') : normalized;
}

/** Build the historical fixture by removing the actual SQLite index, not a comment/regex. */
export function loadPreR3Fixture(db: Database, schema: string, style = process.env.LMS_FIXTURE_LINE_ENDINGS || 'lf'): void {
  db.exec(fixtureSqlForDatabase(schema, style));
  // No IF EXISTS: canonical fixture drift must fail rather than silently alter coverage.
  db.exec('DROP INDEX idx_reward_txn_fund_ref_unique');
}
