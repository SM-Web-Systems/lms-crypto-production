// Real child-process startup proof, using only a synthetic disposable database.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { copyFileSync,mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cutover } from './rbac-cutover.mjs';
import { fingerprintFile } from './rbac-inventory.mjs';
import { retireLegacy } from './rbac-retire-legacy.mjs';

const server=fileURLToPath(new URL('..',import.meta.url));
const directory=mkdtempSync(path.join(tmpdir(),'lms-rbac-runtime-'));
const file=path.join(directory,'synthetic.db');
const environment=Object.fromEntries(Object.entries(process.env).filter(([name])=>
  ['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'].includes(name.toUpperCase())));
environment.NODE_ENV='production';
function run(root,initialize=false,database=file) {
  const module=pathToFileURL(path.join(root,'dist/config/database.js')).href;
  return spawnSync(process.execPath,initialize?[path.join(root,'dist/scripts/initDb.js'),'--initialize-new']:
    ['--input-type=module','-e',`const {db,close}=await import(${JSON.stringify(module)});console.log(JSON.stringify(db.prepare('SELECT user_id,role_id FROM user_roles ORDER BY user_id,role_id').all()));close();`],
    {cwd:directory,env:{...environment,DATABASE_PATH:database},encoding:'utf8',windowsHide:true,timeout:60000});
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
  db=new Database(file,{fileMustExist:true});
  try {
    db.pragma('journal_mode=DELETE');
    db.exec(`
      INSERT INTO rewards(id,creator_user_id,scope_type,scope_id,reward_type,amount_stroops,idempotency_key)
        VALUES('reward','revoked','sponsor_cohort','synthetic','custom',1000,'reward');
      INSERT INTO reward_funding_intents(id,reward_id,owner_user_id,actor_user_id,source_type,network,asset,currency_code,amount_stroops,idempotency_key,expires_at)
        VALUES('intent','reward','revoked','revoked','admin_grant','internal','native','XLM',1000,'intent','2099-01-01');
      INSERT INTO push_installations(id,credential_hash,generation,user_id,enabled,lease_expires_at,updated_at)
        VALUES('device','synthetic',1,'revoked',0,1000,0);
      INSERT INTO offline_progress_receipts(user_id,idempotency_key,request_hash,retain_until)
        VALUES('revoked','offline-receipt','synthetic',1000);
    `);
  } finally { db.close(); }

  const backup=path.join(directory,'uncontracted.db'), restored=path.join(directory,'restored.db');
  copyFileSync(file,backup);
  const source=fingerprintFile(file).sha256;
  const options={database:file,snapshot:true,deployedSha:'a'.repeat(40)};
  const plan=retireLegacy({...options,mode:'plan'});
  assert.equal(plan.snapshotSha256,source);
  const retirement=retireLegacy({...options,mode:'apply',expectedHash:source,backupDatabase:backup,
    acceptClients:true,acceptRecovery:true,reviewReference:'LMS-014/synthetic-runtime'});
  assert.equal(retirement.productionApprovalVerified,false);
  assert.equal(retirement.changed,true);
  assert.equal(retirement.retainedDataSha256After,plan.retainedData.sha256);
  assert.equal(fingerprintFile(backup).sha256,source);

  const contracted=fingerprintFile(file).sha256;
  result=run(server);
  assert.notEqual(result.status,0,'compiled v1 backend must refuse contracted v2');
  assert.match(result.stderr,/reviewed offline rbac-cutover/);
  assert.equal(fingerprintFile(file).sha256,contracted,'v1 refusal must preserve the contracted file');
  assert.equal(retireLegacy({...options,mode:'plan'}).sourceState,'rbac-only-v2');

  copyFileSync(backup,restored);
  result=run(server,false,restored);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/\[\]/,'restored v1 copy must preserve revoked grants');
  assert.equal(fingerprintFile(backup).sha256,source);
  assert.equal(fingerprintFile(file).sha256,contracted);
  console.log(JSON.stringify({syntheticOnly:true,unupgradedStartup:'REFUSED_WITHOUT_WRITES',cutover:'PASS',
    repeatedRestart:'NO_GRANT_RESURRECTION',previousBackend,
    retirement:{retainedData:plan.retainedData,legacyColumnRemoved:retirement.legacyColumnRemoved,
      v1StartupOnV2:'REFUSED_WITHOUT_WRITES',restoredV1Startup:'PASS',backupUnchanged:true,
      productionApprovalVerified:false}},null,2));
} finally {
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith('lms-rbac-runtime-'));
  rmSync(directory,{recursive:true,force:true});
}
