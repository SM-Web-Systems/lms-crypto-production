import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cutover,parseCutoverArguments } from './rbac-cutover.mjs';
import { fingerprintFile } from './rbac-inventory.mjs';

const schema=readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../database/migrations/rbac-only-v1-legacy-trigger.sql',import.meta.url),'utf8');
const roles=[['role_student','student'],['role_supporter_student','super-student'],['role_instructor','instructor'],
  ['role_ta','teaching-assistant'],['role_parent','parent'],['role_teacher','teacher'],['role_employer','employer'],
  ['role_sponsor','sponsor'],['role_admin','admin'],['role_admin2','admin-2'],['role_super_admin','super-admin'],['role_custom','custom-user']];
function fixture(run) {
  const directory=mkdtempSync(path.join(tmpdir(),'lms-rbac-cutover-')),file=path.join(directory,'snapshot.db');
  const db=new Database(file);
  try {
    db.exec(schema);
    db.exec('DROP TABLE authorization_migrations; DROP TRIGGER trg_auto_assign_user_role'); db.exec(legacy);
    for(const [id,name] of roles) db.prepare('INSERT INTO roles(id,name,label,is_system) VALUES(?,?,?,1)').run(id,name,name);
    db.exec(`INSERT INTO users(id,name,email,password_hash,role,authorization_version)
      VALUES('mixed','Synthetic','mixed@example.invalid','synthetic','admin',0),
      ('revoked','Synthetic','revoked@example.invalid','synthetic','admin',2);
      DELETE FROM user_roles;
      INSERT INTO user_roles(user_id,role_id) VALUES('mixed','role_student'),('mixed','role_sponsor');
      INSERT INTO active_sessions(id,user_id,token_hash,expires_at) VALUES('session','mixed','synthetic-session','2099-01-01');`);
    const options={database:file,snapshot:true,deployedSha:'a'.repeat(40)};
    const plan=()=>cutover({...options,mode:'plan'});
    const apply=(extra={})=>cutover({...options,mode:'apply',expectedHash:fingerprintFile(file).sha256,
      acceptRbac:true,reviewReference:'RBAC-STEP-01/synthetic-accepted',...extra});
    return run({db,file,directory,options,plan,apply});
  } finally {
    db.close();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('lms-rbac-cutover-'));
    rmSync(directory,{recursive:true,force:true});
  }
}
test('plan is read-only and records the exact source fingerprint without accepting production evidence',()=>{
  fixture(({file,directory,plan})=>{
    const before=readFileSync(file),entries=readdirSync(directory);
    const result=plan();
    assert.equal(result.mode,'plan'); assert.equal(result.sourceState,'legacy-bridge');
    assert.equal(result.grantsChanged,false); assert.equal(result.changed,false);
    assert.equal(result.productionApprovalVerified,false);
    assert.deepEqual(readFileSync(file),before); assert.deepEqual(readdirSync(directory),entries);
  });
});
test('requires reviewed source hash/attestation and rejects unsupported/mutated triggers without writes',()=>{
  fixture(({db,file,apply})=>{
    const before=readFileSync(file);
    for(const extra of [{acceptRbac:false},{expectedHash:'b'.repeat(64)},{reviewReference:''}]) assert.throws(()=>apply(extra));
    assert.deepEqual(readFileSync(file),before);
    db.exec('DROP TRIGGER trg_auto_assign_user_role; CREATE TRIGGER trg_auto_assign_user_role AFTER INSERT ON users BEGIN SELECT 99; END');
    const changed=readFileSync(file);
    assert.throws(apply,/Changed legacy trigger/); assert.deepEqual(readFileSync(file),changed);
  });
});
test('cutover preserves exact grants/identities, invalidates sessions, and cannot import a revoked legacy admin',()=>{
  fixture(({db,apply,plan})=>{
    const grants=db.prepare('SELECT * FROM user_roles ORDER BY user_id,role_id').all();
    const identities=db.prepare('SELECT id,name,email,password_hash,role,authorization_version FROM users ORDER BY id').all();
    assert.equal(apply().changed,true);
    assert.deepEqual(db.prepare('SELECT * FROM user_roles ORDER BY user_id,role_id').all(),grants);
    const after=db.prepare('SELECT id,name,email,password_hash,role,authorization_version FROM users ORDER BY id').all();
    assert.deepEqual(after,identities.map(row=>({...row,authorization_version:row.authorization_version+1})));
    assert.ok(db.prepare("SELECT revoked_at FROM active_sessions WHERE id='session'").get().revoked_at);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM user_roles WHERE user_id='revoked'").get().total,0);
    const row=db.prepare('SELECT * FROM authorization_migrations').get();
    assert.equal(row.id,'rbac-only-v1'); assert.equal(row.review_reference,'RBAC-STEP-01/synthetic-accepted');
    db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES('raw','Raw','raw@example.invalid','synthetic','admin')").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM user_roles WHERE user_id='raw'").get().total,0);
    assert.equal(plan().sourceState,'rbac-only-v1');
    assert.equal(db.pragma('quick_check',{simple:true}),'ok'); assert.deepEqual(db.pragma('foreign_key_check'),[]);
  });
});
test('repeat apply on the current exact snapshot is a no-op; earlier plan hashes cannot authorize new bytes',()=>{
  fixture(({file,plan,apply})=>{
    const previous=plan().snapshotSha256;
    apply();
    assert.throws(()=>apply({expectedHash:previous}),/does not match/);
    const before=readFileSync(file);
    assert.equal(apply().changed,false);
    assert.deepEqual(readFileSync(file),before);
  });
});
test('failure rolls schema, trigger, versions and sessions back together',()=>{
  fixture(({db,apply})=>{
    db.exec("CREATE TRIGGER synthetic_failure BEFORE UPDATE OF authorization_version ON users BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const before=db.prepare('SELECT * FROM users ORDER BY id').all(),sessions=db.prepare('SELECT * FROM active_sessions').all();
    assert.throws(apply,/synthetic failure/);
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),before);
    assert.deepEqual(db.prepare('SELECT * FROM active_sessions').all(),sessions);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='authorization_migrations'").get(),undefined);
    assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name='trg_auto_assign_user_role'").get().sql,/NEW.role/);
  });
});
test('argument parsing cannot ambiguously select apply or omit values',()=>{
  assert.throws(()=>parseCutoverArguments(['--plan','--apply']));
  assert.throws(()=>parseCutoverArguments(['--database']));
  assert.throws(()=>parseCutoverArguments(['--unreviewed-option']));
  assert.equal(parseCutoverArguments(['--plan','--snapshot']).mode,'plan');
});
