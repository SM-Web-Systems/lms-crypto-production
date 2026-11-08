import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectSnapshot, parseArguments, writePrivateDetails } from './rbac-inventory.mjs';

const SHA = 'a'.repeat(40);
const script = fileURLToPath(new URL('./rbac-inventory.mjs',import.meta.url));
const schema = readFileSync(new URL('../database/migrations/fixtures/rbac-only-v1.schema.sql',import.meta.url),'utf8');
function fixture(run) {
  const directory = mkdtempSync(path.join(tmpdir(),'lms-rbac-inventory-'));
  const file = path.join(directory,'snapshot.db');
  const db = new Database(file);
  try {
    db.exec(schema);
    // This suite inventories pre-cutover snapshots; runtime canonical schema has advanced.
    db.exec('DROP TABLE authorization_migrations; DROP TRIGGER trg_auto_assign_user_role');
    db.exec(readFileSync(new URL('../database/migrations/rbac-only-v1-legacy-trigger.sql',import.meta.url),'utf8'));
    db.prepare("INSERT INTO roles(id,name,label,is_system) VALUES('role_student','student','Student',1),('role_instructor','instructor','Instructor',1),('role_admin','admin','Admin',1),('role_sponsor','sponsor','Sponsor',1)").run();
    db.exec("INSERT INTO permissions(id,name,category,label) VALUES('submit','course.submit','course','Submit'),('manage','course.manage','course','Manage'); INSERT INTO role_permissions(role_id,permission_id) VALUES('role_student','submit'),('role_instructor','manage')");
    return run({db,file,directory, inspect:() => inspectSnapshot({database:file,snapshot:true,deployedSha:SHA})});
  } finally {
    if (db.open) db.close();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('lms-rbac-inventory-'));
    rmSync(directory,{recursive:true,force:true});
  }
}
function user(db,id,role='student',grants=['role_student'],version=0,status=null) {
  db.prepare('INSERT INTO users(id,name,email,password_hash,role,authorization_version,deletion_status) VALUES(?,?,?,?,?,?,?)')
    .run(id,'PRIVATE-NAME',id+'@private.example.test','PRIVATE-PASSWORD-HASH',role,version,status);
  db.prepare('DELETE FROM user_roles WHERE user_id=?').run(id);
  for (const grant of grants) db.prepare('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)').run(id,grant);
}
function profile(db,id) {
  db.prepare("INSERT INTO students(id,user_id,name,email,enrollment_number,department,semester) VALUES(?,?,?,? ,?,'Test',1)")
    .run('profile-'+id,id,'PRIVATE-NAME',id+'@private.example.test','ENR-'+id);
}

test('read-only inspection preserves bytes and directory entries; aggregate output omits identities and credentials',()=>{
  fixture(({db,file,directory,inspect})=>{
    user(db,'PRIVATE-USER-ID'); profile(db,'PRIVATE-USER-ID');
    const before=readFileSync(file), entries=readdirSync(directory);
    const {summary,details}=inspect();
    assert.deepEqual(readFileSync(file),before);
    assert.deepEqual(readdirSync(directory),entries);
    assert.equal(summary.users.total,1);
    assert.equal(summary.schema.applicationMigrationVersion,null);
    assert.equal(summary.gates.migrationReady,false);
    assert.equal(summary.deployedApplication.source,'operator-supplied; not verified against a running server');
    assert.match(summary.snapshotSha256,/^[a-f0-9]{64}$/);
    assert.match(summary.schema.fingerprintSha256,/^[a-f0-9]{64}$/);
    for(const secret of ['PRIVATE-NAME','private.example.test','PRIVATE-PASSWORD-HASH','PRIVATE-USER-ID']) {
      assert.ok(!JSON.stringify(summary).includes(secret));
    }
    assert.ok(!JSON.stringify(details).includes('PRIVATE-PASSWORD-HASH'));
    assert.ok(!JSON.stringify(details).includes('private.example.test'));
    assert.ok(!JSON.stringify(details).includes('PRIVATE-NAME'));
  });
});

test('distinguishes legitimate additive grants, managed revocation, and startup regrant risk without changing any grants',()=>{
  fixture(({db,inspect})=>{
    user(db,'additive','student',['role_instructor']);
    user(db,'revoked','admin',[],3);
    user(db,'unmanaged','admin',[],0);
    const before=db.prepare('SELECT * FROM user_roles ORDER BY user_id,role_id').all();
    const {summary,details}=inspect();
    assert.deepEqual(db.prepare('SELECT * FROM user_roles ORDER BY user_id,role_id').all(),before);
    const rows=new Map(details.accounts.map(account=>[account.userId,account]));
    assert.ok(rows.get('additive').flags.includes('legacy_mapping_absent_from_rbac'));
    assert.ok(!rows.get('additive').flags.includes('unmanaged_account_without_grants'));
    assert.ok(rows.get('revoked').flags.includes('managed_account_without_grants'));
    assert.ok(!rows.get('revoked').flags.includes('startup_legacy_regrant_risk'));
    assert.ok(rows.get('unmanaged').flags.includes('startup_legacy_regrant_risk'));
    assert.equal(summary.rbac.accountFindingCounts.startup_legacy_regrant_risk,2);
  });
});

test('classifies canonical administrators, custom roles, learner profiles, multiple grants, and deletion status separately',()=>{
  fixture(({db,inspect})=>{
    db.exec("INSERT INTO roles(id,name,label) VALUES('delegated','super-delegated-admin','Custom'); INSERT INTO role_permissions(role_id,permission_id) VALUES('delegated','submit')");
    user(db,'admin','student',['role_admin','role_student']); profile(db,'admin');
    user(db,'custom','admin',['delegated']);
    user(db,'deleted','student',[],2,'finalized');
    const {summary,details}=inspect();
    const rows=new Map(details.accounts.map(account=>[account.userId,account]));
    assert.deepEqual(rows.get('admin').explicitAdministratorRoleIds,['role_admin']);
    assert.deepEqual(rows.get('custom').explicitAdministratorRoleIds,[]);
    assert.ok(rows.get('custom').flags.includes('learner_profile_missing'));
    assert.equal(rows.get('deleted').deletionStatus,'finalized');
    assert.equal(summary.users.withDeletionStatus,1);
    assert.equal(summary.rbac.accountFindingCounts.explicit_administrator,1);
    assert.equal(summary.rbac.accountFindingCounts.multi_role_accounts,1);
    assert.equal(summary.rbac.customRoleCount,1);
  });
});

test('lists otherwise unflagged multi-role and custom-grant accounts in the private review',()=>{
  fixture(({db,file,inspect})=>{
    db.exec("INSERT INTO roles(id,name,label) VALUES('delegated','delegated-reader','Delegated reader')");
    user(db,'private-multi','student',['role_student','delegated'],1);
    profile(db,'private-multi');
    const before=readFileSync(file);
    const {summary,details}=inspect();
    assert.deepEqual(readFileSync(file),before);
    assert.equal(summary.rbac.accountFindingCounts.multi_role_accounts,1);
    assert.equal(summary.rbac.accountFindingCounts.custom_role_assignment,1);
    assert.ok(!JSON.stringify(summary).includes('private-multi'));
    assert.deepEqual(details.accounts.map(({userId,flags,scopeObservations})=>({userId,flags,scopeObservations})),[
      {userId:'private-multi',flags:['multi_role_accounts','custom_role_assignment'],scopeObservations:[]},
    ]);
  });
});

test('reports changed canonical identities, dangling grants and broken links without repairing them',()=>{
  fixture(({db,inspect})=>{
    db.pragma('foreign_keys=OFF'); // Deliberately model existing orphaned records in this synthetic fixture only.
    user(db,'linked','student',['role_student','missing-role']);
    db.exec("UPDATE roles SET name='renamed-admin' WHERE id='role_admin'; INSERT INTO user_roles(user_id,role_id) VALUES('missing-user','role_student'); INSERT INTO courses(id,title,course_code) VALUES('course','Course','COURSE'); INSERT INTO course_lecturers(course_id,user_id) VALUES('missing-course','linked'); INSERT INTO user_course_codes(user_id,course_code) VALUES('linked','UNKNOWN')");
    const {summary,details}=inspect();
    assert.equal(summary.rbac.danglingAssignmentCount,2);
    assert.equal(summary.rbac.orphanCourseCodeCount,1);
    assert.ok(details.catalogIssues.some(issue=>issue.roleId==='role_admin'));
    assert.ok(details.foreignKeyViolations.some(row=>row.table==='course_lecturers'));
    assert.ok(details.accounts.find(row=>row.userId==='linked').flags.includes('instructor_assignment_without_capability'));
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM user_roles').get().total,3);
  });
});

test('reports scope counts and marks absent assignments as observations rather than automatic repairs',()=>{
  fixture(({db,inspect})=>{
    user(db,'instructor','student',['role_instructor'],1);
    user(db,'new-sponsor','student',['role_sponsor'],1);
    user(db,'member'); profile(db,'member');
    db.exec("INSERT INTO courses(id,title,course_code) VALUES('course','Course','COURSE'); INSERT INTO user_course_codes(user_id,course_code) VALUES('member','COURSE'); INSERT INTO tenants(id,name,slug) VALUES('tenant','Tenant','tenant'); INSERT INTO tenant_users(tenant_id,user_id) VALUES('tenant','member'); INSERT INTO user_links(id,parent_user_id,child_user_id,link_type) VALUES('link','new-sponsor','member','sponsor'); INSERT INTO sponsor_cohorts(id,name,sponsor_user_id,course_id) VALUES('cohort','Cohort','instructor','course'); INSERT INTO cohort_members(cohort_id,user_id) VALUES('cohort','member')");
    // Make the member appear in details without changing its memberships.
    db.prepare("UPDATE users SET role='lecturer' WHERE id='member'").run();
    const {details}=inspect();
    const rows=new Map(details.accounts.map(row=>[row.userId,row]));
    assert.ok(rows.get('instructor').scopeObservations.includes('no_instructor_course_assignment'));
    assert.ok(rows.get('new-sponsor').scopeObservations.includes('no_owned_cohort'));
    assert.equal(rows.get('member').scopes.tenantMemberships,1);
    assert.equal(rows.get('member').scopes.cohortMemberships,1);
    assert.equal(rows.get('member').scopes.incomingRelationships,1);
    assert.equal(rows.get('member').scopes.courseCodes,1);
  });
});

test('refuses missing input, live sidecars, WAL mode and unsupported schemas without creating or changing database files',()=>{
  fixture(({db,file,directory,inspect})=>{
    assert.throws(()=>inspectSnapshot({database:file,deployedSha:SHA}),/--snapshot/);
    assert.throws(()=>inspectSnapshot({database:file,snapshot:true,deployedSha:'main'}),/40-character/);
    assert.throws(()=>inspectSnapshot({database:path.join(directory,'missing.db'),snapshot:true,deployedSha:SHA}));
    assert.ok(!readdirSync(directory).includes('missing.db'));
    for(const suffix of ['-wal','-shm','-journal']) {
      writeFileSync(file+suffix,'do-not-touch');
      const before=readFileSync(file);
      assert.throws(inspect,/sidecar/);
      assert.equal(readFileSync(file+suffix,'utf8'),'do-not-touch');
      assert.deepEqual(readFileSync(file),before);
      rmSync(file+suffix);
    }
    db.pragma('journal_mode=WAL');
    db.close(); // No remaining sidecars, but the WAL-mode header still must be refused.
    const before=readFileSync(file), entries=readdirSync(directory);
    assert.throws(inspect,/WAL mode/);
    assert.deepEqual(readFileSync(file),before); assert.deepEqual(readdirSync(directory),entries);
    const unsupported=path.join(directory,'unsupported.db');
    const other=new Database(unsupported); other.exec('CREATE TABLE users(id TEXT)'); other.close();
    assert.throws(()=>inspectSnapshot({database:unsupported,snapshot:true,deployedSha:SHA}),/Unsupported snapshot/);
  });
});

test('details use exclusive creation, omit credentials, and have owner-only POSIX file permissions',()=>{
  fixture(({db,file,directory,inspect})=>{
    user(db,'review');
    const {details}=inspect();
    const target=path.join(directory,'private.json');
    writePrivateDetails(target,details);
    assert.equal(JSON.parse(readFileSync(target,'utf8')).accounts[0].userId,'review');
    if(process.platform!=='win32') assert.equal(statSync(target).mode & 0o777,0o600);
    const before=readFileSync(target);
    assert.throws(()=>writePrivateDetails(target,{}),/EEXIST/);
    assert.deepEqual(readFileSync(target),before);
    assert.throws(()=>writePrivateDetails(file,{}),/EEXIST/);
    assert.doesNotThrow(inspect);
  });
});

test('CLI validates arguments, does not load .env, refuses output overwrite and never leaks raw SQL/path errors',()=>{
  fixture(({db,file,directory})=>{
    user(db,'private-user');
    writeFileSync(path.join(directory,'.env'),'DATABASE_PATH=never-created.db\nJWT_SECRET=PRIVATE-ENV-SECRET\n');
    const args=['--snapshot','--database',file,'--deployed-sha',SHA];
    const invoke=extra=>spawnSync(process.execPath,[script,...extra],{cwd:directory,encoding:'utf8',env:{...process.env,DATABASE_PATH:path.join(directory,'ambient.db')}});
    const success=invoke(args);
    assert.equal(success.status,0,success.stderr);
    assert.equal(JSON.parse(success.stdout).users.total,1);
    assert.ok(!readdirSync(directory).includes('ambient.db'));
    assert.ok(!success.stdout.includes('PRIVATE-ENV-SECRET'));
    const overwrite=invoke([...args,'--details-output',file]);
    assert.equal(overwrite.status,2);
    assert.equal(overwrite.stdout,'');
    assert.ok(!overwrite.stderr.includes(file));
    const unknown=invoke(['--apply']);
    assert.equal(unknown.status,2); assert.match(unknown.stderr,/Unknown inventory/);
    assert.throws(()=>parseArguments(['--database']),/Missing or duplicate/);
    assert.throws(()=>parseArguments(['--snapshot','--snapshot']),/Duplicate/);
    assert.throws(()=>parseArguments(['--database','x','--database','y']),/Missing or duplicate/);
  });
});

test('CLI writes a pending private worksheet bound to the expected snapshot and covers all findings', () => {
  fixture(({ db, file, directory, inspect }) => {
    const userId = 'PRIVATE-REVIEW-USER';
    user(db, userId, 'student', ['role_student', 'role_admin'], 1);
    db.pragma('foreign_keys=OFF');
    profile(db, 'PRIVATE-MISSING-PARENT');
    db.prepare('UPDATE students SET rowid = ? WHERE user_id = ?').run(9007199254740993n, 'PRIVATE-MISSING-PARENT');
    const { summary, details } = inspect();
    const before = readFileSync(file);
    const target = path.join(directory, 'review.json');
    const invoke = extra => spawnSync(process.execPath, [
      script, '--snapshot', '--database', file, '--deployed-sha', SHA, '--review-output', target, ...extra,
    ], { encoding: 'utf8' });
    const missing = invoke([]);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /requires the previously recorded/);
    const mismatch = invoke(['--expected-snapshot-sha', '0'.repeat(64)]);
    assert.equal(mismatch.status, 2);
    assert.match(mismatch.stderr, /does not match/);
    assert.ok(!readdirSync(directory).includes('review.json'));

    const expected = ['--expected-snapshot-sha', summary.snapshotSha256];
    const generated = invoke(expected);
    assert.equal(generated.status, 0, generated.stderr);
    assert.ok(!generated.stdout.includes(userId));
    assert.equal(JSON.parse(generated.stdout).gates.migrationReady, false);
    const worksheetBytes = readFileSync(target);
    const review = JSON.parse(worksheetBytes);
    assert.equal(review.status, 'pending');
    assert.equal(review.acceptCurrentRbacAsAuthoritative, false);
    assert.equal(review.snapshotSha256, summary.snapshotSha256);
    assert.equal(review.schemaFingerprintSha256, summary.schema.fingerprintSha256);
    assert.equal(review.deployedSha, SHA);
    const pending = { decision: null, rationale: null };
    assert.deepEqual(review.accountDecisions, [{
      userId, currentRoleIds: details.accounts[0].roleIds,
      flags: details.accounts[0].flags, scopeObservations: [], ...pending,
    }]);
    assert.deepEqual(review.learnerProfileDecisions, [{ userId, flags: ['learner_profile_missing'], ...pending }]);
    assert.equal(details.foreignKeyViolations[0].rowid, '9007199254740993');
    assert.deepEqual(review.integrityDecisions, [
      ...details.catalogIssues.map(reference => ({ kind: 'catalog_issue', reference, ...pending })),
      { kind: 'foreign_key_violation', reference: details.foreignKeyViolations[0], ...pending },
    ]);
    for (const secret of ['PRIVATE-NAME', 'private.example.test', 'PRIVATE-PASSWORD-HASH']) {
      assert.ok(!worksheetBytes.includes(secret));
    }
    if (process.platform !== 'win32') assert.equal(statSync(target).mode & 0o777, 0o600);
    assert.equal(invoke(expected).status, 2);
    assert.deepEqual(readFileSync(target), worksheetBytes);

    const verify = (...extra) => spawnSync(process.execPath, [
      script, '--snapshot', '--database', file, '--deployed-sha', SHA, '--verify-review', target, ...extra,
    ], { encoding: 'utf8' });
    assert.match(verify().stderr, /requires --expected-snapshot-sha/);
    assert.match(verify(...expected, '--details-output', path.join(directory, 'not-written.json')).stderr, /cannot be combined/);
    assert.ok(!readdirSync(directory).includes('not-written.json'));
    assert.match(verify(...expected).stderr, /Review is incomplete/);

    Object.assign(review, {
      status: 'reviewed',
      reviewReference: 'PRIVATE-REVIEW-REFERENCE',
      reviewer: 'PRIVATE-REVIEWER',
      reviewedAt: new Date().toISOString(),
      acceptCurrentRbacAsAuthoritative: true,
      installedClientEvidence: 'PRIVATE-DEVICE-EVIDENCE',
      legacyEndpointUsageEvidence: 'PRIVATE-ENDPOINT-EVIDENCE',
    });
    for (const group of [review.accountDecisions, review.learnerProfileDecisions, review.integrityDecisions]) {
      for (const row of group) Object.assign(row, { decision: 'reviewed', rationale: 'PRIVATE-DECISION' });
    }
    const completed = JSON.stringify(review);
    writeFileSync(target, completed);
    const verified = verify(...expected);
    assert.equal(verified.status, 0, verified.stderr);
    const receipt = JSON.parse(verified.stdout);
    assert.equal(receipt.status, 'REVIEW_RECORD_VERIFIED');
    assert.match(receipt.reviewSha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.migrationReady, false);
    assert.deepEqual(receipt.findingCounts, {
      accountDecisions: 1,
      learnerProfileDecisions: 1,
      integrityDecisions: review.integrityDecisions.length,
    });
    assert.ok(!verified.stdout.includes('PRIVATE-'));
    assert.equal(readFileSync(target, 'utf8'), completed);

    for (const [mutate, error] of [
      [value => { value.deployedSha = '0'.repeat(40); }, /Review binding does not match/],
      [value => { value.legacyEndpointUsageEvidence = ''; }, /Review is incomplete/],
      [value => { value.learnerProfileDecisions[0].rationale = null; }, /decision and rationale/],
      [value => { value.accountDecisions[0].currentRoleIds.pop(); }, /Review finding rows do not match/],
      [value => { value.integrityDecisions.pop(); }, /Review finding rows do not match/],
    ]) {
      const changed = JSON.parse(completed);
      mutate(changed);
      writeFileSync(target, JSON.stringify(changed));
      const refused = verify(...expected);
      assert.equal(refused.status, 2);
      assert.equal(refused.stdout, '');
      assert.match(refused.stderr, error);
      assert.ok(!refused.stderr.includes('PRIVATE-'));
    }
    assert.deepEqual(readFileSync(file), before);
  });
});
