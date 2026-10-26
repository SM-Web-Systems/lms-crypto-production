import type { Database as SqliteDatabase, RunResult } from 'better-sqlite3';

/** Test data only: a real users INSERT and explicit current RBAC IDs, atomically. */
export function seedTestAccount(db: SqliteDatabase, sql: string, parameters: unknown[], roleIds: string[]): RunResult {
  return db.transaction(() => {
    const rows = db.prepare(sql.trim().replace(/;$/, '') + ' RETURNING id').all(...parameters) as {id:string}[];
    const lastInsertRowid = db.prepare('SELECT last_insert_rowid()').pluck().get() as number | bigint;
    for (const {id} of rows) for (const roleId of roleIds) {
      if (typeof roleId !== 'string' || !roleId) throw new Error('Explicit fixture RBAC role ID required');
      db.prepare('INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES(?,?)').run(id,roleId);
    }
    return {changes: rows.length,lastInsertRowid};
  }).immediate();
}
