// Explicit offline upgrade only; no application imports, .env, role inference or network.
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectSnapshot, fingerprintFile } from './rbac-inventory.mjs';

const schema=readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../database/migrations/rbac-only-v1-legacy-trigger.sql',import.meta.url),'utf8');
const normalize=sql=>sql.replace(/\bIF\s+NOT\s+EXISTS\b/gi,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expected=new Database(':memory:'); expected.exec(schema);
const ddl=name=>expected.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(name).sql;
const guardDdl=ddl('trg_auto_assign_user_role'),ledgerDdl=ddl('authorization_migrations');
expected.close();

function requireCondition(value,message) { if(!value) throw new Error(message); }
function grants(db) {
  return {
    roles:db.prepare('SELECT * FROM roles ORDER BY id').all(),
    permissions:db.prepare('SELECT * FROM permissions ORDER BY id').all(),
    rolePermissions:db.prepare('SELECT * FROM role_permissions ORDER BY role_id,permission_id').all(),
    userRoles:db.prepare('SELECT * FROM user_roles ORDER BY user_id,role_id').all(),
  };
}
function sourceState(db) {
  const guard=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_auto_assign_user_role'").get();
  requireCondition(guard,'Missing role trigger requires separate review.');
  const hasLedger=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='authorization_migrations'").get();
  if(hasLedger) {
    const row=db.prepare("SELECT * FROM authorization_migrations WHERE id='rbac-only-v1'").get();
    requireCondition(row && db.prepare('SELECT COUNT(*) AS total FROM authorization_migrations').get().total===1 &&
      normalize(guard.sql)===normalize(guardDdl),'Invalid cutover marker/fence requires separate review.');
    return 'rbac-only-v1';
  }
  requireCondition(normalize(guard.sql)===normalize(legacy),'Changed legacy trigger requires separate review.');
  return 'legacy-bridge';
}

export function cutover(options) {
  requireCondition(options.mode==='plan' || options.mode==='apply','Choose exactly one --plan or --apply mode.');
  const {summary}=inspectSnapshot(options);
  requireCondition(summary.rbac.catalogIssueCount===0 && summary.rbac.danglingAssignmentCount===0 &&
    summary.rbac.orphanCourseCodeCount===0 && Object.keys(summary.rbac.foreignKeyViolationCounts).length===0,
    'Resolve catalog/link/integrity exceptions before cutover; no repair was attempted.');
  if(options.mode==='apply') {
    requireCondition(options.acceptRbac===true,'Explicit --accept-rbac-as-authoritative is required.');
    requireCondition(/^[a-f0-9]{64}$/i.test(options.expectedHash ?? '') &&
      options.expectedHash.toLowerCase()===summary.snapshotSha256,'Snapshot does not match --expected-snapshot-sha256.');
    requireCondition(/^[A-Za-z0-9/._:#-]{1,180}$/.test(options.reviewReference ?? ''),
      'A non-secret --review-reference identifying the accepted Step 1 assessment is required.');
  }
  const db=new Database(path.resolve(options.database),{readonly:options.mode==='plan',fileMustExist:true});
  try {
    if(options.mode==='plan') db.pragma('query_only=ON');
    const before=grants(db),fingerprint=hash(before);
    const state=sourceState(db);
    const result={version:1,mode:options.mode,sourceState:state,snapshotSha256:summary.snapshotSha256,
      sourceGrantsSha256:fingerprint,users:summary.users.total,
      activeSessionsToRevoke:db.prepare('SELECT COUNT(*) AS total FROM active_sessions WHERE revoked_at IS NULL').get().total,
      grantsChanged:false,legacyColumnRetained:true,applicationMigrationId:'rbac-only-v1',
      productionApprovalVerified:false,operatorReviewReference:options.reviewReference ?? null};
    if(options.mode==='plan' || state==='rbac-only-v1') return {...result,changed:false};
    db.pragma('foreign_keys=ON');
    db.transaction(()=>{
      requireCondition(fingerprintFile(path.resolve(options.database)).sha256===summary.snapshotSha256,'Snapshot changed; re-plan cutover.');
      requireCondition(sourceState(db)==='legacy-bridge' && hash(grants(db))===fingerprint,'Source changed; re-plan cutover.');
      db.exec(ledgerDdl);
      db.exec('DROP TRIGGER trg_auto_assign_user_role');
      db.exec(guardDdl);
      // Invalidate pre-cutover sessions and pending handoffs; never infer a grant.
      db.exec("UPDATE users SET authorization_version=authorization_version+1; UPDATE active_sessions SET revoked_at=datetime('now') WHERE revoked_at IS NULL");
      db.prepare('INSERT INTO authorization_migrations(id,source_snapshot_sha256,source_grants_sha256,review_reference) VALUES(?,?,?,?)')
        .run('rbac-only-v1',summary.snapshotSha256,fingerprint,options.reviewReference);
      requireCondition(hash(grants(db))===fingerprint,'RBAC grants changed; transaction rolled back.');
      requireCondition(db.pragma('foreign_key_check').length===0,'Foreign-key check failed; transaction rolled back.');
      requireCondition(db.pragma('quick_check',{simple:true})==='ok','Integrity check failed; transaction rolled back.');
    }).immediate();
    return {...result,changed:true,allExistingSessionsInvalidated:true};
  } finally { db.close(); }
}

export function parseCutoverArguments(args) {
  const options={};
  const flags={'--database':'database','--deployed-sha':'deployedSha','--expected-snapshot-sha256':'expectedHash','--review-reference':'reviewReference'};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--plan' || arg==='--apply') {
      requireCondition(!options.mode,'Choose exactly one --plan or --apply mode.'); options.mode=arg.slice(2);
    } else if(arg==='--snapshot' || arg==='--accept-rbac-as-authoritative') {
      const key=arg==='--snapshot'?'snapshot':'acceptRbac';
      requireCondition(!options[key],'Duplicate cutover argument.'); options[key]=true;
    } else if(Object.hasOwn(flags,arg)) {
      const key=flags[arg],value=args[++i];
      requireCondition(!options[key] && value && !value.startsWith('--'),'Missing or duplicate cutover argument.'); options[key]=value;
    } else throw new Error('Unknown cutover argument.');
  }
  return options;
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  if(process.argv.length===3 && process.argv[2]==='--help') {
    console.log('Offline only: node scripts/rbac-cutover.mjs --plan|--apply --snapshot --database <separate-finalized-copy> --deployed-sha <40 hex> [--expected-snapshot-sha256 <64 hex> --review-reference <Step-1-reference> --accept-rbac-as-authoritative]. Apply preserves RBAC grants and invalidates all sessions. See SERVER-HANDOVER-RBAC-STEP-02-BACKEND-CUTOVER.md.');
  } else {
    try { console.log(JSON.stringify(cutover(parseCutoverArguments(process.argv.slice(2))),null,2)); }
    catch { console.error('RBAC cutover refused. Verify the finalized snapshot, exact plan/hash, supported schema/trigger, integrity and accepted Step 1 review. No automatic repair or role reconciliation is available.'); process.exitCode=2; }
  }
}
