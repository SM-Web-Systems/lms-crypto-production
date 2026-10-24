import type { Database } from 'better-sqlite3';
import { createHash } from 'node:crypto';

export type ForeignKeyEvidence = ReadonlySet<string>;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
function refuse(): never {
  throw new Error('Database startup refused: new, changed or unsupported foreign key violation evidence. Preserve the database and obtain a reviewed repair; no rows were repaired automatically.');
}
function cell(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return ['blob', value.toString('hex')];
  if (typeof value === 'bigint') return ['integer', value.toString()];
  if (typeof value === 'number') return ['real', Number.isFinite(value) ? value : String(value)];
  return [typeof value, value];
}

/** Private exact identities, not a count or customer-data warning payload.
 * Include referenced values and child primary keys: SQLite's table/rowid/fkid
 * tuple alone cannot detect a changed orphan with the same rowid and count.
 */
export function captureForeignKeyEvidence(db: Database): ForeignKeyEvidence {
  const violations = db.prepare('PRAGMA foreign_key_check').safeIntegers(true).all() as
    Array<{ table: string; rowid: bigint | null; parent: string; fkid: bigint }>;
  const evidence = new Set<string>();
  for (const violation of violations) {
    const columns = db.pragma(`table_xinfo(${quote(violation.table)})`) as Array<{name:string; pk:number}>;
    // A WITHOUT ROWID violation has no unambiguous child row locator in PRAGMA.
    // Refuse this unsupported legacy layout rather than accepting a lossy hash.
    if (violation.rowid === null) refuse();
    const rowidAlias = ['rowid', '_rowid_', 'oid'].find(name => !columns.some(c => c.name.toLowerCase() === name));
    if (!rowidAlias) refuse();
    const foreign = (db.pragma(`foreign_key_list(${quote(violation.table)})`) as Array<{
      id:number; seq:number; table:string; from:string; to:string|null; on_update:string; on_delete:string; match:string;
    }>).filter(key => key.id === Number(violation.fkid)).sort((a,b) => a.seq-b.seq);
    if (!foreign.length) refuse();
    const row = db.prepare(`SELECT * FROM ${quote(violation.table)} WHERE ${quote(rowidAlias)} = ?`)
      .safeIntegers(true).get(violation.rowid) as Record<string, unknown> | undefined;
    if (!row) refuse();
    const primary = columns.filter(c => c.pk).sort((a,b) => a.pk-b.pk).map(c => [c.name, cell(row[c.name])]);
    const signature = [violation.table, violation.rowid.toString(), violation.parent, violation.fkid.toString(),
      foreign, primary, foreign.map(key => [key.from, cell(row[key.from])])];
    evidence.add(createHash('sha256').update(JSON.stringify(signature)).digest('hex'));
  }
  return evidence;
}

/** Existing exact evidence may remain or be resolved; no new/changed orphan may appear. */
export function assertNoNewForeignKeyEvidence(actual: ForeignKeyEvidence, baseline: ForeignKeyEvidence): void {
  for (const signature of actual) if (!baseline.has(signature)) refuse();
}
