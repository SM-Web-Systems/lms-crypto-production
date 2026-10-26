// Real process rehearsal, synthetic disposable databases only; never accepts a DB path.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync,readFileSync,copyFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { retireLegacy } from './rbac-retire-legacy.mjs';
import { fingerprintFile } from './rbac-inventory.mjs';

const server=fileURLToPath(new URL('..',import.meta.url));
const directory=mkdtempSync(path.join(tmpdir(),'lms-rbac-retired-runtime-'));
const fresh=path.join(directory,'fresh.db'), file=path.join(directory,'migration.db'), backup=path.join(directory,'backup.db');
const environment=Object.fromEntries(Object.entries(process.env).filter(([name])=>
  ['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'].includes(name.toUpperCase())));
Object.assign(environment,{NODE_ENV:'production'});
function run(root,database,initialize=false) {
  const module=pathToFileURL(path.join(root,'dist/config/database.js')).href;
  return spawnSync(process.execPath,initialize?[path.join(root,'dist/scripts/initDb.js'),'--initialize-new']:
    ['--input-type=module','-e',`const {db,close}=await import(${JSON.stringify(module)});console.log(JSON.stringify(db.prepare('SELECT user_id,role_id FROM user_roles ORDER BY user_id,role_id').all()));close();`],
    {cwd:directory,env:{...environment,DATABASE_PATH:database},encoding:'utf8',windowsHide:true,timeout:60000});
}
try {
  let result=run(server,fresh,true); assert.equal(result.status,0,result.stderr);
  let db=new Database(fresh,{readonly:true});
  const seed=Object.fromEntries(['roles','permissions','role_permissions'].map(table=>[table,db.prepare('SELECT * FROM '+table).all()]));
  assert.ok(!db.pragma('table_info(users)').some(column=>column.name==='role'));
  db.close();
  db=new Database(file);
  db.exec(readFileSync(new URL('../database/migrations/fixtures/rbac-only-v1.schema.sql',import.meta.url),'utf8'));
  for(const [table,rows] of Object.entries(seed)) for(const row of rows) {
    const columns=Object.keys(row);db.prepare('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...Object.values(row));
  }
  db.exec(`INSERT INTO users(id,name,email,password_hash,role,authorization_version) VALUES
    ('revoked','Synthetic','revoked@example.invalid','unused','admin',9),
    ('learner','Synthetic','learner@example.invalid','unused','lecturer',3);
    INSERT INTO user_roles(user_id,role_id) VALUES('learner','role_student');`);
  db.close(); copyFileSync(file,backup);
  const before=readFileSync(file);
  result=run(server,file);
  assert.notEqual(result.status,0,'v1 requires explicit offline contraction');
  assert.match(result.stderr,/reviewed offline rbac-retire-legacy/);
  assert.deepEqual(readFileSync(file),before,'refused startup must be read-only');
  const migrated=retireLegacy({mode:'apply',database:file,backupDatabase:backup,snapshot:true,deployedSha:'a'.repeat(40),
    expectedHash:fingerprintFile(file).sha256,reviewReference:'RBAC-STEP-01-03/synthetic-runtime-and-recovery',
    acceptClients:true,acceptRecovery:true});
  assert.equal(migrated.changed,true);assert.deepEqual(readFileSync(backup),before);
  let previousBackend='NOT_RUN';
  if(process.env.RBAC_PREVIOUS_SERVER) {
    const upgraded=readFileSync(file);
    result=run(path.resolve(process.env.RBAC_PREVIOUS_SERVER),file);
    assert.notEqual(result.status,0,'previous backend must refuse the v2 floor');
    assert.match(result.stderr,/Database startup refused/);
    assert.deepEqual(readFileSync(file),upgraded,'prior backend refusal must not change bytes');
    previousBackend='REFUSED_WITHOUT_WRITES';
  }
  for(let restart=0;restart<2;restart++) {
    result=run(server,file);assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/"user_id":"learner","role_id":"role_student"/);
    assert.ok(!result.stdout.includes('"user_id":"revoked"'),'restart must not recreate revoked grants');
  }
  db=new Database(file,{readonly:true});
  try {
    assert.ok(!db.pragma('table_info(users)').some(column=>column.name==='role'));
    assert.equal(db.prepare("SELECT authorization_version FROM users WHERE id='revoked'").get().authorization_version,9);
    assert.equal(db.pragma('foreign_key_check').length,0);
    assert.equal(db.pragma('quick_check',{simple:true}),'ok');
  } finally {db.close();}
  console.log(JSON.stringify({syntheticOnly:true,freshInitialization:'ROLE_FREE',v1Startup:'REFUSED_WITHOUT_WRITES',
    contraction:'EXACT_RETAINED_DATA_AND_GRANTS',repeatedRestart:'NO_GRANT_RESURRECTION',previousBackend},null,2));
} finally {
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith('lms-rbac-retired-runtime-'));
  rmSync(directory,{recursive:true,force:true});
}
