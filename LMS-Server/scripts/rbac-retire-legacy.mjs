// Explicit offline contraction only. Never imports the app, dotenv or providers.
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectSnapshot, fingerprintFile } from './rbac-inventory.mjs';

const V1 = 'rbac-only-v1', V2 = 'rbac-only-v2';
const fence = 'CREATE TRIGGER trg_auto_assign_user_role AFTER INSERT ON users FOR EACH ROW BEGIN SELECT 1; END';
const normalize = sql => sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const roleDefinition = /(?:"role"|role)\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'student'\s+CHECK\s*\(\s*(?:"role"|role)\s+IN\s*\(\s*'student'\s*,\s*'lecturer'\s*,\s*'admin'\s*\)\s*\)\s*,/gi;

function sourceState(db) {
  const ledger = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='authorization_migrations'").get();
  requireCondition(ledger, 'Step 2 migration ledger is required.');
  const ids = db.prepare('SELECT id FROM authorization_migrations ORDER BY id').all().map(row => row.id);
  requireCondition([V1,V2,V1+','+V2].includes(ids.join(',')), 'Unknown authorization migration.');
  const ledgerColumns = db.pragma('table_info(authorization_migrations)');
  requireCondition(['id','applied_at','source_snapshot_sha256','source_grants_sha256','review_reference']
    .every(name => ledgerColumns.some(column => column.name === name && column.type.toUpperCase() === 'TEXT')) &&
    ledgerColumns.find(column => column.name === 'id')?.pk === 1, 'Unknown migration ledger schema.');
  const columns = db.pragma('table_xinfo(users)');
  const role = columns.find(column => column.name === 'role');
  const trigger = db.prepare("SELECT type,sql FROM sqlite_master WHERE name='trg_auto_assign_user_role'").get();
  if (ids.includes(V2)) {
    requireCondition(!role && !trigger, 'Incomplete or changed retired schema.');
    return V2;
  }
  requireCondition(ids.length === 1 && ids[0] === V1, 'Step 2 must be accepted first.');
  requireCondition(role?.type.toUpperCase() === 'TEXT' && role.notnull === 1 && role.pk === 0 &&
    role.hidden === 0 && role.dflt_value === "'student'", 'Unknown legacy column definition.');
  requireCondition(trigger?.type === 'trigger' && normalize(trigger.sql) === fence, 'Changed or missing Step 2 rollback fence.');
  const users = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  requireCondition(users && [...users.sql.matchAll(roleDefinition)].length === 1, 'Unknown users CHECK/default definition.');
  const version = db.prepare('SELECT sqlite_version() AS version').get().version.split('.').map(Number);
  requireCondition(version[0] > 3 || (version[0] === 3 && version[1] >= 35), 'SQLite DROP COLUMN support is required.');
  // Refuse ambiguous dependencies rather than attempting to rewrite custom SQL.
  const objects = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all();
  for (const object of objects) {
    requireCondition(!/^CREATE\s+VIRTUAL\s+TABLE/i.test(object.sql), 'Virtual/custom schema requires separate review.');
    if (object.name === 'users' || object.name === 'trg_auto_assign_user_role') continue;
    requireCondition(!(object.type === 'trigger' && (object.tbl_name === 'users' ||
      /\b(?:user_roles|role_permissions|roles|permissions)\b/i.test(object.sql))), 'Unexpected identity/RBAC trigger requires separate review.');
    requireCondition(!/\brole\b/i.test(object.sql), 'A schema object depends on or ambiguously names the retired column.');
    requireCondition(!(object.type === 'view' && /\busers\b/i.test(object.sql)), 'A users view requires separate review.');
  }
  return V1;
}

function schemaWithoutRetiredObjects(db) {
  // Preserve quoted values/identifiers; only SQL trivia can vary after ALTER.
  const tokens = sql => (sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|[^\s]/g) ?? [])
    .filter(token => !token.startsWith('--') && !token.startsWith('/*')).join('');
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")
    .all().filter(row => row.name !== 'trg_auto_assign_user_role')
    .map(row => ({...row, sql: row.sql ? tokens(row.name === 'users' ? row.sql.replace(roleDefinition, '') : row.sql) : null}));
}

/** Hash every retained cell, including histories, grants, sessions and SQLite sequences. */
export function retainedDataFingerprint(db, selectedTables) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name")
    .all().map(row => row.name).filter(name => name !== 'authorization_migrations' && (!selectedTables || selectedTables.includes(name)));
  const hash = createHash('sha256');
  let totalRows = 0;
  for (const table of tables) {
    const columns = db.pragma('table_xinfo(' + quote(table) + ')').filter(column => column.hidden !== 1 &&
      !(table === 'users' && column.name === 'role')).map(column => column.name);
    const order = columns.flatMap(name => ['typeof(' + quote(name) + ')', quote(name) + ' COLLATE BINARY']).join(',');
    hash.update(JSON.stringify([table, columns]));
    for (const row of db.prepare('SELECT ' + columns.map(quote).join(',') + ' FROM ' + quote(table) + ' ORDER BY ' + order).raw().safeIntegers().iterate()) {
      hash.update(JSON.stringify(row.map(value => typeof value === 'bigint' ? ['integer', value.toString()] :
        Buffer.isBuffer(value) ? ['blob', value.toString('base64')] : [typeof value, value])) + '\n');
      totalRows++;
    }
  }
  return {sha256: hash.digest('hex'), tables: tables.length, rows: totalRows};
}

export function retireLegacy(options) {
  requireCondition(['plan', 'apply'].includes(options.mode), 'Choose one plan/apply mode.');
  const {summary} = inspectSnapshot(options);
  requireCondition(summary.rbac.catalogIssueCount === 0 && summary.rbac.danglingAssignmentCount === 0 &&
    summary.rbac.orphanCourseCodeCount === 0 && Object.keys(summary.rbac.foreignKeyViolationCounts).length === 0,
    'Resolve catalog and integrity exceptions first; no repair was attempted.');
  const file = realpathSync(path.resolve(options.database));
  const db = new Database(file, {readonly: options.mode === 'plan', fileMustExist: true});
  try {
    if (options.mode === 'plan') db.pragma('query_only=ON');
    const state = sourceState(db), retained = retainedDataFingerprint(db);
    const grantHash = retainedDataFingerprint(db, ['roles','permissions','role_permissions','user_roles']).sha256;
    const beforeSchema = digest(schemaWithoutRetiredObjects(db));
    const ledgerBefore = db.prepare('SELECT * FROM authorization_migrations ORDER BY id').all();
    const result = {reportVersion: 1, mode: options.mode, sourceState: state, targetState: V2,
      snapshotSha256: summary.snapshotSha256, retainedData: retained, changed: false,
      sourceGrantsSha256: grantHash,
      grantsChanged: false, sessionsChanged: false, productionApprovalVerified: false,
      prerequisites: 'Accepted RBAC-STEP-01/02/03, supported-client retirement and compatible recovery/image rehearsal.'};
    if (options.mode === 'plan') return result;
    requireCondition(/^[a-f0-9]{64}$/i.test(options.expectedHash ?? '') &&
      options.expectedHash.toLowerCase() === summary.snapshotSha256, 'Snapshot does not match expected source hash.');
    requireCondition(options.acceptClients && options.acceptRecovery, 'Explicit client-retirement and coordinated-recovery assertions are required.');
    requireCondition(/^[A-Za-z0-9/._:#-]{1,180}$/.test(options.reviewReference ?? ''), 'A non-secret accepted assessment reference is required.');
    if (state === V2) return result; // Exact current source, no write and no repeat ledger row.
    requireCondition(options.backupDatabase, 'A separate matching finalized backup is required.');
    const backupReport = inspectSnapshot({...options, database: options.backupDatabase}).summary;
    const backup = realpathSync(path.resolve(options.backupDatabase));
    requireCondition(backup !== file, 'Backup must be a separate file.');
    const inputStat = statSync(file), backupStat = statSync(backup);
    requireCondition(inputStat.ino && backupStat.ino, 'File identity cannot establish an independent backup.');
    requireCondition(!(inputStat.ino && inputStat.ino === backupStat.ino && inputStat.dev === backupStat.dev), 'Backup aliases the input file.');
    requireCondition(backupReport.snapshotSha256 === summary.snapshotSha256, 'Backup does not match the source.');
    db.pragma('foreign_keys=ON');
    db.transaction(() => {
      requireCondition(fingerprintFile(file).sha256 === summary.snapshotSha256 &&
        fingerprintFile(backup).sha256 === summary.snapshotSha256, 'Source or backup changed; re-plan.');
      requireCondition(sourceState(db) === V1 && retainedDataFingerprint(db).sha256 === retained.sha256, 'Source changed; re-plan.');
      db.exec('DROP TRIGGER trg_auto_assign_user_role');
      db.exec('ALTER TABLE users DROP COLUMN role');
      requireCondition(digest(schemaWithoutRetiredObjects(db)) === beforeSchema, 'Unrelated schema changed; transaction rolled back.');
      requireCondition(retainedDataFingerprint(db).sha256 === retained.sha256, 'Retained data changed; transaction rolled back.');
      requireCondition(db.pragma('foreign_key_check').length === 0 && db.pragma('integrity_check', {simple:true}) === 'ok',
        'Post-migration integrity failed; transaction rolled back.');
      requireCondition(digest(db.prepare('SELECT * FROM authorization_migrations ORDER BY id').all()) === digest(ledgerBefore), 'Migration history changed.');
      db.prepare('INSERT INTO authorization_migrations(id,source_snapshot_sha256,source_grants_sha256,review_reference) VALUES(?,?,?,?)')
        .run(V2, summary.snapshotSha256, grantHash, options.reviewReference);
      requireCondition(sourceState(db) === V2, 'Target schema verification failed; transaction rolled back.');
    }).immediate();
    return {...result, changed: true, legacyColumnRemoved: true, backupVerified: true,
      retainedDataSha256After: retainedDataFingerprint(db).sha256, reviewReference: options.reviewReference};
  } finally { db.close(); }
}

export function parseRetirementArguments(args) {
  const options = {};
  const values = {'--database':'database','--deployed-sha':'deployedSha','--expected-snapshot-sha256':'expectedHash',
    '--review-reference':'reviewReference','--backup-database':'backupDatabase'};
  const flags = {'--snapshot':'snapshot','--accept-client-retirement':'acceptClients','--accept-coordinated-recovery':'acceptRecovery'};
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (['--plan','--apply'].includes(argument)) {
      requireCondition(!options.mode, 'Choose one mode.'); options.mode = argument.slice(2);
    } else if (Object.hasOwn(flags, argument)) {
      requireCondition(!options[flags[argument]], 'Duplicate argument.'); options[flags[argument]] = true;
    } else if (Object.hasOwn(values, argument)) {
      const value = args[++i], key = values[argument];
      requireCondition(!options[key] && value && !value.startsWith('--'), 'Missing or duplicate argument.'); options[key] = value;
    } else throw new Error('Unknown retirement argument.');
  }
  return options;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Offline only: --plan|--apply --snapshot --database <finalized-copy> --deployed-sha <40 hex>. Apply also requires --expected-snapshot-sha256 <64 hex> --backup-database <separate-identical-copy> --review-reference <accepted-Step-01-to-03-and-recovery-record> --accept-client-retirement --accept-coordinated-recovery. No production approval is inferred. See SERVER-HANDOVER-RBAC-STEP-04-SCHEMA-AND-COMPATIBILITY-REMOVAL.md.');
  } else {
    try { console.log(JSON.stringify(retireLegacy(parseRetirementArguments(process.argv.slice(2))), null, 2)); }
    catch { console.error('RBAC retirement refused. Verify the finalized source/backup, expected hash, Step 2 schema/fence, dependency/integrity checks and accepted client/recovery assessment. No automatic repair was attempted.'); process.exitCode = 2; }
  }
}
