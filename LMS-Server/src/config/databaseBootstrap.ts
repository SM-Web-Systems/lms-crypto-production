import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the explicit CLI can request creation, before importing database.ts.
// Neither server arguments nor an environment flag authorize initialization.
let initializeNew = false;
export function requestNewDatabaseInitialization(): void { initializeNew = true; }

const canonicalSql = fs.readFileSync(fileURLToPath(new URL('../../database/schema.sql', import.meta.url)), 'utf8');
const required = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../database/required-schema.json', import.meta.url)), 'utf8')) as { tables: Record<string, string[]>; indexes: string[]; keys: Record<string, { primary: string[]; unique: string[][]; foreign: string[][] }> };
const expected = new Database(':memory:');
expected.exec(canonicalSql);
function keys(db: SqliteDatabase, table: string) {
  const quote = (name: string) => `'${name.replaceAll("'", "''")}'`;
  return {
    primary: (db.pragma(`table_info(${quote(table)})`) as { name: string; pk: number }[]).filter(c => c.pk).sort((a,b) => a.pk-b.pk).map(c => c.name),
    unique: (db.pragma(`index_list(${quote(table)})`) as { name: string; unique: number; partial: number }[]).filter(i => i.unique).map(i => {
      const columns = (db.pragma(`index_info(${quote(i.name)})`) as { name: string }[]).map(c => c.name);
      if (!i.partial) return columns;
      const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(i.name) as { sql: string };
      const predicate = ddl.sql.match(/\bWHERE\b([\s\S]*)$/i)?.[1].replace(/\s+/g, ' ').trim();
      return [`WHERE ${predicate}`, ...columns];
    }),
    foreign: (db.pragma(`foreign_key_list(${quote(table)})`) as { from: string; table: string; to: string; on_update: string; on_delete: string }[]).map(f => [f.from,f.table,f.to,f.on_update,f.on_delete]),
  };
}
function validateKeys(db: SqliteDatabase, table: string, contract: ReturnType<typeof keys>): void {
  const actual = keys(db, table);
  if (JSON.stringify(actual.primary) !== JSON.stringify(contract.primary)) refuse(`missing primary key (${table})`);
  for (const kind of ['unique', 'foreign'] as const) {
    for (const signature of contract[kind]) if (!actual[kind].some(k => JSON.stringify(k) === JSON.stringify(signature))) refuse(`missing ${kind} constraint (${table})`);
  }
}
const baseline = (expected.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
  .map(({ name }) => ({ name, keys: keys(expected, name), columns: (expected.pragma(`table_info("${name}")`) as { name: string }[]).map(c => c.name) }));
expected.close();

function refuse(reason: string): never {
  throw new Error(`Database startup refused: ${reason}. Preserve the database and its WAL/SHM/journal files; restore or perform a reviewed upgrade. db:init --initialize-new is only for a separate new database.`);
}

export function validateDatabase(db: SqliteDatabase, afterMigrations = false): void {
  if (db.pragma('quick_check', { simple: true }) !== 'ok') refuse('integrity check failed');
  for (const table of baseline) {
    const columns = db.pragma(`table_info("${table.name}")`) as { name: string }[];
    validateKeys(db, table.name, table.keys);
    for (const column of table.columns) {
      // This release's additive authorization migration is safe on existing databases.
      if (!afterMigrations && table.name === 'users' && column === 'authorization_version') continue;
      if (!columns.some(c => c.name === column)) refuse(`unsupported schema (${table.name}.${column})`);
    }
  }
  if ((db.pragma('foreign_key_check') as unknown[]).length) refuse('foreign key check failed');
  const ddl = (table: string) => (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql: string }).sql;
  if (!ddl('users').includes("'lecturer'")) refuse('legacy users constraint requires a reviewed migration');
  if (!ddl('payments').includes("'refunded'")) refuse('legacy payments constraint requires a reviewed migration');
  if ((db.pragma('table_info(nft_credentials)') as { name: string; notnull: number }[]).find(c => c.name === 'quiz_id')?.notnull) refuse('legacy NFT constraint');
  if (!(db.pragma('foreign_key_list(quizzes)') as { from: string; on_delete: string }[]).some(f => f.from === 'course_id' && f.on_delete === 'SET NULL')) refuse('legacy quiz foreign key');
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND (sql LIKE '%_users_old%' OR sql LIKE '%_nft_creds_b0_old%')").get()) refuse('stale foreign key references');
  if (afterMigrations) {
    for (const [table, names] of Object.entries(required.tables)) {
      const columns = db.pragma(`table_info("${table}")`) as { name: string }[];
      for (const name of names) if (!columns.some(c => c.name === name)) refuse(`incomplete migration (${table}.${name})`);
    }
    for (const [table, contract] of Object.entries(required.keys)) validateKeys(db, table, contract);
    for (const index of required.indexes) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(index)) refuse(`missing required index (${index})`);
    }
  }
}

export function openApplicationDatabase(filename: string): { database: SqliteDatabase; initializing: boolean } {
  if (filename === ':memory:') {
    if (!process.env.VITEST) refuse('in-memory databases are reserved for tests');
    return { database: new Database(':memory:'), initializing: false };
  }
  const resolved = path.resolve(filename);
  const exists = fs.existsSync(resolved);
  if (initializeNew) {
    if (exists || ['-wal', '-shm', '-journal'].some(s => fs.existsSync(resolved + s))) refuse('initialization target or sidecar already exists');
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.closeSync(fs.openSync(resolved, 'wx', 0o600));
    return { database: new Database(resolved, { fileMustExist: true }), initializing: true };
  }
  if (!exists) refuse('database file is missing');
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) refuse('database is empty or not a regular file');
  const inspection = new Database(resolved, { readonly: true, fileMustExist: true });
  try { validateDatabase(inspection); } finally { inspection.close(); }
  return { database: new Database(resolved, { fileMustExist: true }), initializing: false };
}

export function loadCanonicalSchema(db: SqliteDatabase): void { db.exec(canonicalSql); }
