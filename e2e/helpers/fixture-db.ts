import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(path.resolve(__dirname,'../../LMS-Server/package.json'));
const Database = require('better-sqlite3');
type FixtureDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {run(...params: unknown[]): unknown; get(...params: unknown[]): any; all(...params: unknown[]): any[]};
};

export function assertFixtureConfiguration(): string {
  const file = process.env.DATABASE_PATH;
  if (process.env.E2E_FIXTURE_MODE !== '1' || !file) throw new Error('Isolated E2E database configuration required');
  const relative = path.relative(tmpdir(),path.resolve(file));
  if (relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(file).startsWith('lms-e2e-')) {
    throw new Error('Fixture writes require a disposable lms-e2e-* database inside the OS temp directory');
  }
  for (const url of [process.env.E2E_API_URL || 'http://localhost:3001',process.env.E2E_BASE_URL || 'http://localhost:5173']) {
    if (!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new Error('E2E must target loopback services');
  }
  return file;
}

export function withFixtureDatabase<T>(action: (db: FixtureDatabase) => T): T {
  const file = assertFixtureConfiguration();
  const db = new Database(file,{fileMustExist:true});
  try { return db.transaction(()=>action(db)).immediate(); } finally { db.close(); }
}
