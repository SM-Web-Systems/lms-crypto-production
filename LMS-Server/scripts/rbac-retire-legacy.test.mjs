import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, copyFileSync, linkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { retireLegacy, parseRetirementArguments, retainedDataFingerprint } from './rbac-retire-legacy.mjs';
import { fingerprintFile } from './rbac-inventory.mjs';

const schema = readFileSync(new URL('../database/migrations/fixtures/rbac-only-v1.schema.sql',import.meta.url),'utf8');
const catalog = {role_student:'student',role_supporter_student:'super-student',role_instructor:'instructor',
  role_ta:'teaching-assistant',role_parent:'parent',role_teacher:'teacher',role_employer:'employer',
  role_sponsor:'sponsor',role_admin:'admin',role_admin2:'admin-2',role_super_admin:'super-admin',role_custom:'custom-user'};
function fixture(run) {
  const directory = mkdtempSync(path.join(tmpdir(),'lms-rbac-retire-'));
  const file = path.join(directory,'source.db'), backup = path.join(directory,'backup.db');
  let db = new Database(file);
  db.exec(schema);
  for (const [id,name] of Object.entries(catalog)) db.prepare('INSERT INTO roles(id,name,label,is_system) VALUES(?,?,?,1)').run(id,name,name);
  db.exec(`INSERT INTO users(id,name,email,password_hash,role,authorization_version) VALUES
    ('multi','Synthetic','multi@example.invalid','private-hash','admin',5),
    ('revoked','Synthetic','revoked@example.invalid','private-hash','admin',9);
    INSERT INTO user_roles(user_id,role_id) VALUES('multi','role_student'),('multi','role_instructor');
    CREATE TABLE retained_blob(id INTEGER PRIMARY KEY AUTOINCREMENT,amount INTEGER,bytes BLOB,note TEXT CHECK(length(note)>0));
    INSERT INTO retained_blob(amount,bytes,note) VALUES(9223372036854775807,X'00FFCAFE','historical role=admin');
    INSERT INTO active_sessions(id,user_id,token_hash,expires_at) VALUES('session','multi','synthetic-token-hash','2099-01-01');
    ALTER TABLE users ADD COLUMN custom_retained TEXT DEFAULT 'opaque';`);
  db.close();
  const options = () => ({mode:'apply',database:file,snapshot:true,deployedSha:'a'.repeat(40),
    expectedHash:fingerprintFile(file).sha256,backupDatabase:backup,
    reviewReference:'RBAC-STEP-01-03/synthetic-and-recovery',acceptClients:true,acceptRecovery:true});
  try {
    return run({file,backup,options,mutate:sql=>{db=new Database(file);try {db.exec(sql);}finally {db.close();}},copy:()=>copyFileSync(file,backup)});
  } finally {
    if (db.open) db.close();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('lms-rbac-retire-'));
    rmSync(directory,{recursive:true,force:true});
  }
}
test('plan is byte-preserving, declares unverified production approval and reports retained data only',()=>fixture(({file,options})=>{
  const before=readFileSync(file), result=retireLegacy({...options(),mode:'plan'});
  assert.deepEqual(readFileSync(file),before);
  assert.equal(result.sourceState,'rbac-only-v1');assert.equal(result.changed,false);assert.equal(result.productionApprovalVerified,false);
  assert.equal(result.retainedData.tables>10,true);
  assert.ok(!JSON.stringify(result).includes('private-hash'));assert.ok(!JSON.stringify(result).includes('multi@example'));
}));
test('native column removal preserves every retained cell, key, extra column, history and assignment',()=>fixture(({file,backup,copy,options})=>{
  copy();const originalBackup=readFileSync(backup);
  let db=new Database(file,{readonly:true});const before=retainedDataFingerprint(db);db.close();
  const result=retireLegacy(options());assert.equal(result.changed,true);assert.equal(result.retainedDataSha256After,before.sha256);
  assert.deepEqual(readFileSync(backup),originalBackup);
  db=new Database(file,{readonly:true});
  try {
    assert.ok(!db.pragma('table_xinfo(users)').some(column=>column.name==='role'));
    assert.ok(db.pragma('table_info(users)').some(column=>column.name==='custom_retained'));
    assert.equal(retainedDataFingerprint(db).sha256,before.sha256);
    assert.deepEqual(db.prepare('SELECT role_id FROM user_roles WHERE user_id=? ORDER BY role_id').pluck().all('multi'),['role_instructor','role_student']);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id='revoked'").get().n,0);
    assert.equal(db.prepare("SELECT authorization_version FROM users WHERE id='revoked'").get().authorization_version,9);
    assert.equal(db.prepare("SELECT revoked_at FROM active_sessions WHERE id='session'").get().revoked_at,null);
    assert.deepEqual(db.prepare('SELECT id FROM authorization_migrations ORDER BY id').pluck().all(),['rbac-only-v1','rbac-only-v2']);
    assert.equal(db.pragma('foreign_key_check').length,0);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  } finally { db.close(); }
}));
test('repeat plan/apply is a byte-identical no-op and stale source hashes refuse',()=>fixture(({file,copy,options})=>{
  copy();const old=options();retireLegacy(old);const after=readFileSync(file);
  assert.throws(()=>retireLegacy(old),/source hash/);
  assert.equal(retireLegacy(options()).changed,false);assert.deepEqual(readFileSync(file),after);
  assert.equal(retireLegacy({...options(),mode:'plan'}).sourceState,'rbac-only-v2');
}));
test('missing assertions, wrong checksum, absent/mismatched/aliased backups all refuse without writes',()=>fixture(({file,backup,copy,options})=>{
  const before=readFileSync(file);copy();
  for (const extra of [{acceptClients:false},{acceptRecovery:false},{expectedHash:'b'.repeat(64)},{backupDatabase:undefined},{backupDatabase:file},{reviewReference:''}]) {
    assert.throws(()=>retireLegacy({...options(),...extra}));assert.deepEqual(readFileSync(file),before);
  }
  const other=new Database(backup);other.exec("UPDATE users SET name='different'");other.close();
  assert.throws(()=>retireLegacy(options()),/Backup does not match/);assert.deepEqual(readFileSync(file),before);
}));
test('a hard-linked backup alias is refused without changing the source',()=>fixture(({file,backup,options})=>{
  linkSync(file,backup);
  const before=readFileSync(file);
  assert.throws(()=>retireLegacy(options()),/aliases/);
  assert.deepEqual(readFileSync(file),before);
}));
for (const [name,sql] of [
  ['unknown future marker',"INSERT INTO authorization_migrations(id,review_reference) VALUES('future-schema','synthetic')"],
  ['changed fence',"DROP TRIGGER trg_auto_assign_user_role;CREATE TRIGGER trg_auto_assign_user_role AFTER INSERT ON users BEGIN SELECT 2; END"],
  ['legacy-dependent index',"CREATE INDEX custom_dependency ON users(role)"],
  ['users view',"CREATE VIEW custom_profile AS SELECT * FROM users"],
  ['unexpected user trigger',"CREATE TRIGGER custom_user_trigger AFTER INSERT ON users BEGIN SELECT 1; END"],
  ['foreign key damage',"PRAGMA foreign_keys=OFF;INSERT INTO user_roles(user_id,role_id) VALUES('absent','role_student')"],
]) test(name+' refuses in plan and preserves the source',()=>fixture(({file,mutate,options})=>{
  mutate(sql);const before=readFileSync(file);
  assert.throws(()=>retireLegacy({...options(),mode:'plan'}));assert.deepEqual(readFileSync(file),before);
}));
test('failure late in the transaction rolls back the column, fence, ledger and retained data',()=>fixture(({file,copy,mutate,options})=>{
  mutate("CREATE TRIGGER synthetic_abort BEFORE INSERT ON authorization_migrations BEGIN SELECT RAISE(ABORT,'synthetic-failure'); END");
  copy();const before=readFileSync(file);
  assert.throws(()=>retireLegacy(options()),/synthetic-failure/);
  assert.deepEqual(readFileSync(file),before);
}));
test('argument parser rejects ambiguous/duplicate/missing values',()=>{
  for (const args of [['--plan','--apply'],['--unknown'],['--database'],['--snapshot','--snapshot']]) assert.throws(()=>parseRetirementArguments(args));
  assert.equal(parseRetirementArguments(['--plan','--snapshot']).mode,'plan');
});
test('a killed process between column removal and ledger commit recovers the entire transaction',()=>fixture(({file})=>{
  let db = new Database(file,{readonly:true});
  const before = retainedDataFingerprint(db);
  db.close();
  const sqlite = new URL('../node_modules/better-sqlite3/lib/index.js',import.meta.url).href;
  const child = spawnSync(process.execPath,['--input-type=module','-e',
    `import Database from ${JSON.stringify(sqlite)};
     const db = new Database(${JSON.stringify(file)});
     db.exec('BEGIN IMMEDIATE; DROP TRIGGER trg_auto_assign_user_role; ALTER TABLE users DROP COLUMN role');
     process.kill(process.pid,'SIGKILL');`],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.notEqual(child.status,0,'child must terminate before commit');
  db = new Database(file,{fileMustExist:true}); // SQLite recovers its hot rollback journal.
  try {
    assert.equal(retainedDataFingerprint(db).sha256,before.sha256);
    assert.ok(db.pragma('table_info(users)').some(column=>column.name==='role'));
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='trg_auto_assign_user_role'").get());
    assert.deepEqual(db.prepare('SELECT id FROM authorization_migrations').pluck().all(),['rbac-only-v1']);
    assert.equal(db.pragma('foreign_key_check').length,0);
    assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  } finally {db.close();}
}));
