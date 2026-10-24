import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { captureForeignKeyEvidence, assertNoNewForeignKeyEvidence } from '../config/foreignKeyIntegrity.js';

const handles: Database.Database[]=[];
function fixture() {
  const db=new Database(':memory:'); handles.push(db); db.pragma('foreign_keys=OFF');
  db.exec(`CREATE TABLE parent(id TEXT PRIMARY KEY);
    CREATE TABLE child(id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id), note TEXT);
    INSERT INTO child(rowid,id,parent_id,note) VALUES(7,'legacy','missing-parent','keep');`);
  return db;
}
afterEach(()=>{ for(const db of handles.splice(0)) db.close(); });

describe('startup foreign-key evidence',()=>{
  it('accepts unchanged legacy evidence using private digests only',()=>{
    const db=fixture(); const baseline=captureForeignKeyEvidence(db);
    expect(baseline.size).toBe(1);
    expect([...baseline]).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
    expect(()=>assertNoNewForeignKeyEvidence(captureForeignKeyEvidence(db),baseline)).not.toThrow();
    expect(JSON.stringify([...baseline])).not.toContain('missing-parent');
  });
  it('rejects a new orphan and rolls back all migration writes',()=>{
    const db=fixture(); const baseline=captureForeignKeyEvidence(db);
    expect(()=>db.transaction(()=>{
      db.exec("ALTER TABLE child ADD COLUMN migrated INTEGER; INSERT INTO child VALUES('new','another-parent','new',1)");
      assertNoNewForeignKeyEvidence(captureForeignKeyEvidence(db),baseline);
    }).immediate()).toThrow(/foreign key/);
    expect(db.prepare('SELECT COUNT(*) n FROM child').get()).toEqual({n:1});
    expect((db.pragma('table_info(child)') as any[]).map(c=>c.name)).not.toContain('migrated');
  });
  it('rejects changed referenced values even when SQLite tuple and violation count stay identical',()=>{
    const db=fixture(); const before=db.pragma('foreign_key_check'); const baseline=captureForeignKeyEvidence(db);
    db.exec("UPDATE child SET parent_id='different-parent'");
    expect(db.pragma('foreign_key_check')).toEqual(before);
    expect(()=>assertNoNewForeignKeyEvidence(captureForeignKeyEvidence(db),baseline)).toThrow(/foreign key/);
  });
  it('rejects replacement child identity at the same physical rowid',()=>{
    const db=fixture(); const baseline=captureForeignKeyEvidence(db);
    db.exec("UPDATE child SET id='replacement'");
    expect(()=>assertNoNewForeignKeyEvidence(captureForeignKeyEvidence(db),baseline)).toThrow(/foreign key/);
  });
  it('permits unrelated metadata/additive columns and resolved orphan removal',()=>{
    const db=fixture(); const baseline=captureForeignKeyEvidence(db);
    db.exec("ALTER TABLE child ADD COLUMN progress_pct INTEGER; UPDATE child SET note='updated',progress_pct=25");
    expect(()=>assertNoNewForeignKeyEvidence(captureForeignKeyEvidence(db),baseline)).not.toThrow();
    db.exec("INSERT INTO parent VALUES('missing-parent')");
    expect(captureForeignKeyEvidence(db).size).toBe(0);
    expect(()=>assertNoNewForeignKeyEvidence(captureForeignKeyEvidence(db),baseline)).not.toThrow();
  });
  it('captures full composite FK values and binary keys without leaking them',()=>{
    const db=fixture(); db.exec(`CREATE TABLE pair(a BLOB,b TEXT,PRIMARY KEY(a,b));
      CREATE TABLE linked(id TEXT PRIMARY KEY,a BLOB,b TEXT,FOREIGN KEY(a,b) REFERENCES pair(a,b));
      INSERT INTO linked VALUES('composite',X'0102','missing');`);
    const baseline=captureForeignKeyEvidence(db);
    db.exec("UPDATE linked SET a=X'0103'");
    expect(()=>assertNoNewForeignKeyEvidence(captureForeignKeyEvidence(db),baseline)).toThrow(/foreign key/);
  });
  it('refuses unsupported WITHOUT ROWID orphan evidence rather than hashing an ambiguous locator',()=>{
    const db=fixture(); db.exec(`CREATE TABLE no_rowid(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES parent(id)) WITHOUT ROWID;
      INSERT INTO no_rowid VALUES('evidence','missing');`);
    expect(()=>captureForeignKeyEvidence(db)).toThrow(/unsupported foreign key/);
  });
  it('distinguishes opposite infinite REAL reference values instead of JSON-null collisions',()=>{
    const db=fixture(); db.exec(`CREATE TABLE real_parent(id REAL PRIMARY KEY);
      CREATE TABLE real_child(id TEXT PRIMARY KEY,parent_id REAL REFERENCES real_parent(id));
      INSERT INTO real_child VALUES('real-evidence',1e999);`);
    const baseline=captureForeignKeyEvidence(db);
    db.exec('UPDATE real_child SET parent_id=-1e999');
    expect(()=>assertNoNewForeignKeyEvidence(captureForeignKeyEvidence(db),baseline)).toThrow(/foreign key/);
  });
});
