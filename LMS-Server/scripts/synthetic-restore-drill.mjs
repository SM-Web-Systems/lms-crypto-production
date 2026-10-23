// Always synthetic. No input database paths, production volumes or credentials.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, cpSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

if (process.argv.length !== 2) throw new Error('This drill accepts no database arguments; synthetic fixtures only');
const directory = mkdtempSync(path.join(tmpdir(),'auth13-restore-'));
let source;
try {
  const file = path.join(directory,'source.db');
  source = new Database(file);
  source.pragma('journal_mode=WAL'); source.pragma('wal_autocheckpoint=0'); source.pragma('foreign_keys=ON');
  source.exec(`CREATE TABLE identities(id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE history(id TEXT PRIMARY KEY, owner TEXT REFERENCES identities(id), value TEXT NOT NULL);
    INSERT INTO identities VALUES('synthetic-user','preserve'); INSERT INTO history VALUES('synthetic-history','synthetic-user','committed WAL evidence');`);
  assert.ok(existsSync(file+'-wal'));
  const rows = db => ({identities:db.prepare('SELECT * FROM identities ORDER BY id').all(),history:db.prepare('SELECT * FROM history ORDER BY id').all()});
  const before = rows(source);
  const backup = path.join(directory,'backup.db');
  await source.backup(backup);
  const restoredFile = path.join(directory,'restored.db');cpSync(backup,restoredFile);
  const restored = new Database(restoredFile);
  try {
    assert.equal(restored.pragma('integrity_check',{simple:true}),'ok');
    assert.deepEqual(restored.pragma('foreign_key_check'),[]);assert.deepEqual(rows(restored),before);
    restored.prepare("UPDATE identities SET value='restored copy only'").run();
    assert.deepEqual(rows(source),before,'restore must not mutate original rows');
  } finally { restored.close(); }
  const corruptFile = path.join(directory,'corrupt.db');writeFileSync(corruptFile,'synthetic corrupt snapshot');
  assert.throws(()=>{const corrupt=new Database(corruptFile,{readonly:true});try{corrupt.pragma('integrity_check');}finally{corrupt.close();}});
  console.log(JSON.stringify({syntheticOnly:true,verdict:'PASS',sourceWalPresent:true,integrity:'ok',foreignKeys:'ok',restoredRows:2,sourceRowsUnchanged:true,
    backupSha256:createHash('sha256').update(readFileSync(backup)).digest('hex')},null,2));
} finally { source?.close(); rmSync(directory,{recursive:true,force:true}); }
