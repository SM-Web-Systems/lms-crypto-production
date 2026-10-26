// Real child-process startup proof, using only a synthetic disposable database.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cutover } from './rbac-cutover.mjs';
import { fingerprintFile } from './rbac-inventory.mjs';

const server=fileURLToPath(new URL('..',import.meta.url));
const directory=mkdtempSync(path.join(tmpdir(),'lms-rbac-runtime-'));
const file=path.join(directory,'synthetic.db');
const environment=Object.fromEntries(Object.entries(process.env).filter(([name])=>
  ['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'].includes(name.toUpperCase())));
Object.assign(environment,{DATABASE_PATH:file,NODE_ENV:'production'});
function run(root,initialize=false) {
  const module=pathToFileURL(path.join(root,'dist/config/database.js')).href;
  return spawnSync(process.execPath,initialize?[path.join(root,'dist/scripts/initDb.js'),'--initialize-new']:
    ['--input-type=module','-e',`const {db,close}=await import(${JSON.stringify(module)});console.log(JSON.stringify(db.prepare('SELECT user_id,role_id FROM user_roles ORDER BY user_id,role_id').all()));close();`],
    {cwd:directory,env:environment,encoding:'utf8',windowsHide:true,timeout:60000});
}
try {
  let result=run(server,true); assert.equal(result.status,0,result.stderr);
  let db=new Database(file);
  db.pragma('journal_mode=DELETE');
  db.exec('DROP TABLE authorization_migrations; DROP TRIGGER trg_auto_assign_user_role');
  db.exec(readFileSync(new URL('../database/migrations/rbac-only-v1-legacy-trigger.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO users(id,name,email,password_hash,role) VALUES('revoked','Synthetic','revoked@example.invalid','synthetic','admin');
    DELETE FROM user_roles WHERE user_id='revoked';`);
  db.close();
  const before=readFileSync(file);
  result=run(server);
  assert.notEqual(result.status,0,'new backend must require explicit cutover');
  assert.match(result.stderr,/reviewed offline rbac-cutover/);
  assert.deepEqual(readFileSync(file),before,'refused startup must be read-only');
  cutover({mode:'apply',database:file,snapshot:true,deployedSha:'a'.repeat(40),acceptRbac:true,
    expectedHash:fingerprintFile(file).sha256,reviewReference:'RBAC-STEP-01/synthetic-runtime'});
  let previousBackend='NOT_RUN';
  if(process.env.RBAC_PREVIOUS_SERVER) {
    const upgraded=readFileSync(file);
    result=run(path.resolve(process.env.RBAC_PREVIOUS_SERVER));
    assert.notEqual(result.status,0,'previous backend must not accept the new fence');
    assert.match(result.stderr,/missing or changed role trigger/);
    assert.deepEqual(readFileSync(file),upgraded,'old startup transaction must roll back all writes');
    previousBackend='REFUSED_WITHOUT_WRITES';
  }
  for(let restart=0;restart<2;restart++) {
    result=run(server); assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/\[\]/,'restart must not recreate a revoked legacy admin');
  }
  db=new Database(file,{readonly:true});
  try {
    assert.equal(db.prepare("SELECT role FROM users WHERE id='revoked'").get().role,'admin');
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM user_roles WHERE user_id='revoked'").get().total,0);
    assert.equal(db.pragma('quick_check',{simple:true}),'ok');
  } finally { db.close(); }
  console.log(JSON.stringify({syntheticOnly:true,unupgradedStartup:'REFUSED_WITHOUT_WRITES',cutover:'PASS',
    repeatedRestart:'NO_GRANT_RESURRECTION',previousBackend},null,2));
} finally {
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith('lms-rbac-runtime-'));
  rmSync(directory,{recursive:true,force:true});
}
