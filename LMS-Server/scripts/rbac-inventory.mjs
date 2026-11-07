// Offline inventory only. Never import application modules: database.ts migrates on import.
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const BUILT_INS = {
  role_student: 'student', role_supporter_student: 'super-student',
  role_instructor: 'instructor', role_ta: 'teaching-assistant',
  role_parent: 'parent', role_teacher: 'teacher', role_employer: 'employer',
  role_sponsor: 'sponsor', role_admin: 'admin', role_admin2: 'admin-2',
  role_super_admin: 'super-admin', role_custom: 'custom-user',
};
const LEGACY_MAP = { student: 'role_student', lecturer: 'role_instructor', admin: 'role_admin' };
const ADMIN_IDS = ['role_admin', 'role_admin2', 'role_super_admin'];
const REQUIRED = {
  users: ['id', 'authorization_version', 'deletion_status'],
  roles: ['id', 'name', 'is_system'], user_roles: ['user_id', 'role_id'],
  permissions: ['id', 'name'], role_permissions: ['role_id', 'permission_id'],
  students: ['id', 'user_id'], courses: ['id', 'course_code'],
  course_lecturers: ['user_id', 'course_id'], course_tas: ['user_id', 'course_id'],
  user_course_codes: ['user_id', 'course_code'],
  sponsor_cohorts: ['id', 'sponsor_user_id', 'course_id'],
  cohort_members: ['user_id', 'cohort_id'], tenants: ['id'],
  tenant_users: ['user_id', 'tenant_id', 'tenant_role'],
  user_links: ['parent_user_id', 'child_user_id', 'link_type'],
  user_groups: ['id', 'owner_user_id', 'group_type'],
  user_group_members: ['group_id', 'user_id'],
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function fingerprintFile(file) {
  const fd=openSync(file,'r'), hash=createHash('sha256'), buffer=Buffer.alloc(1024*1024);
  let header;
  try {
    let length;
    while((length=readSync(fd,buffer,0,buffer.length,null))>0) {
      if(!header) header=Buffer.from(buffer.subarray(0,100));
      hash.update(buffer.subarray(0,length));
    }
    return {header:header ?? Buffer.alloc(0),sha256:hash.digest('hex')};
  } finally { closeSync(fd); }
}

function refuse(message) { throw new Error(message); }
function assertStandalone(file) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { lstatSync(file + suffix); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    refuse('Snapshot has a WAL/SHM/journal sidecar. Use a separate consistent, finalized snapshot; do not delete live sidecars.');
  }
}
function validateSchema(db) {
  for (const [table, names] of Object.entries(REQUIRED)) {
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name);
    if (names.some(name => !columns.includes(name))) {
      refuse(`Unsupported snapshot schema: required inventory columns missing from ${table}. No upgrade was attempted.`);
    }
    const object = db.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(table);
    if (object?.type !== 'table') refuse(`Unsupported snapshot schema: ${table} must be a table.`);
  }
}

function inventory(db, metadata) {
  validateSchema(db);
  if (db.pragma('quick_check', { simple: true }) !== 'ok') refuse('Snapshot integrity check failed.');
  const hasLegacyRole = db.pragma('table_info(users)').some(column => column.name === 'role');
  if (!hasLegacyRole) {
    const ledger = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='authorization_migrations'").get();
    const marker = ledger && db.prepare("SELECT 1 FROM authorization_migrations WHERE id='rbac-only-v2'").get();
    if (!marker) refuse('Unsupported snapshot schema: users.role is absent without a retirement marker.');
  }
  const legacyRole = hasLegacyRole ? 'role' : 'NULL AS role';
  const users = db.prepare(`SELECT id,${legacyRole},authorization_version,deletion_status FROM users ORDER BY id`).all();
  const roles = db.prepare('SELECT id,name,is_system FROM roles ORDER BY id').all();
  const assignments = db.prepare('SELECT user_id,role_id FROM user_roles ORDER BY user_id,role_id').all();
  const capabilities = db.prepare(`SELECT DISTINCT ur.user_id,p.name FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id`).all();
  const roleById = new Map(roles.map(role => [role.id, role]));
  const byUser = new Map(users.map(user => [user.id, []]));
  const permissions = new Map(users.map(user => [user.id, new Set()]));
  for (const row of capabilities) permissions.get(row.user_id)?.add(row.name);
  const danglingAssignments = [];
  for (const row of assignments) {
    if (!byUser.has(row.user_id) || !roleById.has(row.role_id)) {
      danglingAssignments.push({ userId: row.user_id, roleId: row.role_id,
        missingUser: !byUser.has(row.user_id), missingRole: !roleById.has(row.role_id) });
    }
    if (roleById.has(row.role_id)) byUser.get(row.user_id)?.push(row.role_id);
  }
  const profiles = new Map();
  for (const row of db.prepare('SELECT user_id,COUNT(*) AS total FROM students GROUP BY user_id').all()) profiles.set(row.user_id, row.total);
  const countByUser = (sql) => new Map(db.prepare(sql).all().map(row => [row.user_id, row.total]));
  const instructors = countByUser('SELECT user_id,COUNT(*) AS total FROM course_lecturers GROUP BY user_id');
  const tas = countByUser('SELECT user_id,COUNT(*) AS total FROM course_tas GROUP BY user_id');
  const enrollments = countByUser('SELECT user_id,COUNT(*) AS total FROM user_course_codes GROUP BY user_id');
  const cohorts = countByUser('SELECT sponsor_user_id AS user_id,COUNT(*) AS total FROM sponsor_cohorts GROUP BY sponsor_user_id');
  const cohortMembers = countByUser('SELECT user_id,COUNT(*) AS total FROM cohort_members GROUP BY user_id');
  const tenants = countByUser('SELECT user_id,COUNT(*) AS total FROM tenant_users GROUP BY user_id');
  const links = countByUser('SELECT parent_user_id AS user_id,COUNT(*) AS total FROM user_links GROUP BY parent_user_id');
  const children = countByUser('SELECT child_user_id AS user_id,COUNT(*) AS total FROM user_links GROUP BY child_user_id');
  const groups = countByUser('SELECT owner_user_id AS user_id,COUNT(*) AS total FROM user_groups GROUP BY owner_user_id');
  const groupMembers = countByUser('SELECT user_id,COUNT(*) AS total FROM user_group_members GROUP BY user_id');
  const counters = {};
  const bridge = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_auto_assign_user_role'").get();
  const legacyBridgeActive = /NEW\s*\.\s*role/i.test(bridge?.sql ?? '') && /user_roles/i.test(bridge?.sql ?? '');
  const accountDetails = [];
  const increment = code => { counters[code] = (counters[code] ?? 0) + 1; };
  const legacyCounts = { student: 0, lecturer: 0, admin: 0, unknown: 0 };
  for (const user of users) {
    const grants = byUser.get(user.id);
    const can = permissions.get(user.id);
    const flags = [];
    const note = code => { flags.push(code); increment(code); };
    const mapped = Object.hasOwn(LEGACY_MAP, user.role) ? LEGACY_MAP[user.role] : null;
    if (hasLegacyRole) legacyCounts[mapped ? user.role : 'unknown']++;
    if (hasLegacyRole && !mapped) note('unknown_legacy_value');
    if (!grants.length) note(user.authorization_version > 0 ? 'managed_account_without_grants' : 'unmanaged_account_without_grants');
    if (mapped && !grants.includes(mapped)) {
      note('legacy_mapping_absent_from_rbac');
      // Old images can also regrant during startup without an insert trigger.
      if (user.authorization_version === 0) note('startup_legacy_regrant_risk');
    }
    if (can.has('course.submit') && !profiles.get(user.id)) note('learner_profile_missing');
    if ((profiles.get(user.id) ?? 0) > 1) note('multiple_learner_profiles');
    if (instructors.has(user.id) && !can.has('course.manage')) note('instructor_assignment_without_capability');
    if (tas.has(user.id) && !can.has('course.grade_pending')) note('ta_assignment_without_capability');
    if (cohorts.has(user.id) && !can.has('cohort.view_own')) note('cohort_owner_without_capability');
    const explicitAdmin = ADMIN_IDS.filter(id => grants.includes(id) &&
      roleById.get(id)?.name === BUILT_INS[id] && roleById.get(id)?.is_system === 1);
    if (explicitAdmin.length) note('explicit_administrator');
    if (grants.length > 1) note('multi_role_accounts');
    if (grants.some(id => !Object.hasOwn(BUILT_INS, id))) note('custom_role_assignment');
    // Absence of assignments can be legitimate for a newly provisioned role.
    const scopeObservations = [];
    if (can.has('course.manage') && !instructors.has(user.id) && !explicitAdmin.length) scopeObservations.push('no_instructor_course_assignment');
    if (can.has('course.grade_pending') && !tas.has(user.id) && !explicitAdmin.length) scopeObservations.push('no_ta_course_assignment');
    if (grants.includes('role_sponsor') && !cohorts.has(user.id)) scopeObservations.push('no_owned_cohort');
    if (grants.some(id => ['role_parent','role_teacher','role_employer'].includes(id)) && !links.has(user.id) && !groups.has(user.id)) {
      scopeObservations.push('no_owned_group_or_outgoing_relationship');
    }
    if (flags.length || scopeObservations.length) accountDetails.push({
      userId: user.id, legacyRole: user.role, roleIds: grants,
      authorizationVersion: user.authorization_version, deletionStatus: user.deletion_status,
      flags, scopeObservations, explicitAdministratorRoleIds: explicitAdmin,
      scopes: {
        instructorCourses: instructors.get(user.id) ?? 0, taCourses: tas.get(user.id) ?? 0,
        courseCodes: enrollments.get(user.id) ?? 0, ownedCohorts: cohorts.get(user.id) ?? 0,
        cohortMemberships: cohortMembers.get(user.id) ?? 0, tenantMemberships: tenants.get(user.id) ?? 0,
        outgoingRelationships: links.get(user.id) ?? 0, incomingRelationships: children.get(user.id) ?? 0,
        ownedGroups: groups.get(user.id) ?? 0, groupMemberships: groupMembers.get(user.id) ?? 0,
      },
    });
  }
  const catalogIssues = [];
  for (const [id, name] of Object.entries(BUILT_INS)) {
    const role = roleById.get(id);
    if (!role || role.name !== name || role.is_system !== 1) catalogIssues.push({roleId:id, issue:'missing_or_changed_canonical_role'});
  }
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').safeIntegers().all().map(violation => {
    // Keep the exact row locator for private review, including 64-bit row IDs.
    let rowid = violation.rowid;
    if (rowid !== null) {
      const numericRowId = Number(rowid);
      rowid = Number.isSafeInteger(numericRowId) ? numericRowId : String(rowid);
    }
    return { ...violation, rowid, fkid: Number(violation.fkid) };
  });
  const foreignKeyCounts = {};
  for (const violation of foreignKeys) foreignKeyCounts[violation.table] = (foreignKeyCounts[violation.table] ?? 0) + 1;
  const orphanCourseCodes = db.prepare(`SELECT uc.user_id AS userId,uc.course_code AS courseCode FROM user_course_codes uc
    LEFT JOIN courses c ON c.course_code=uc.course_code WHERE c.id IS NULL ORDER BY uc.user_id,uc.course_code`).all();
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const schemaFingerprint = sha256(JSON.stringify(schema));
  const summary = {
    ...metadata, reportVersion: 1, readOnly: true, productionInventoryVerified: false,
    purpose: 'Inventory only; no migration or role changes are authorized by this report.',
    schema: { sqliteVersion: db.prepare('SELECT sqlite_version() AS version').get().version,
      sqliteUserVersion: db.pragma('user_version', {simple:true}), fingerprintSha256: schemaFingerprint,
      applicationMigrationVersion: null,
      versionNote: 'SQLite user_version and schema fingerprint do not establish the deployed application migration level.' },
    users: { total: users.length, legacyColumnPresent: hasLegacyRole, withoutDeletionStatus: users.filter(user => user.deletion_status === null).length,
      withDeletionStatus: users.filter(user => user.deletion_status !== null).length, legacyCounts },
    rbac: { assignments: assignments.length, roles: roles.length, legacyBridgeActive,
      builtInAssignmentCounts: Object.fromEntries(Object.keys(BUILT_INS).map(id => [id, assignments.filter(row => row.role_id === id).length])),
      customRoleCount: roles.filter(role => !Object.hasOwn(BUILT_INS,role.id)).length,
      accountFindingCounts: counters, catalogIssueCount: catalogIssues.length,
      danglingAssignmentCount: danglingAssignments.length, foreignKeyViolationCounts: foreignKeyCounts,
      orphanCourseCodeCount: orphanCourseCodes.length,
      accountsWithScopeObservations: accountDetails.filter(user => user.scopeObservations.length).length },
    interpretation: {
      legacyMismatch: 'Often legitimate after additive RBAC grants; never union legacy grants into current RBAC automatically.',
      noGrants: 'Preserve managed revocations and deletion status. Review before granting anything.',
      missingScopes: 'Observation only: an unassigned/new role is not automatically a damaged account.',
      administrator: 'Explicit canonical built-in grant, not a privilege inferred from a name or legacy field.',
    },
    gates: { productionAccountDecisions: 'NOT_REVIEWED', legacyEndpointUsage: 'NOT_REVIEWED',
      installedClientCompatibility: 'NOT_REVIEWED', migrationReady: false },
  };
  return { summary, details: {
    reportVersion: 1, snapshotSha256: metadata.snapshotSha256,
    privacy: 'Contains account/resource identifiers; keep in an operator-controlled private directory. Names, emails and credentials are excluded.',
    accounts: accountDetails, catalogIssues, danglingAssignments,
    foreignKeyViolations: foreignKeys, orphanCourseCodes,
  }};
}

export function inspectSnapshot({ database, snapshot, deployedSha, expectedSnapshotSha }) {
  if (snapshot !== true) refuse('Explicit --snapshot confirmation is required. Inspect a separate finalized snapshot, never the live database.');
  if (!database || !/^[a-f0-9]{40}$/i.test(deployedSha ?? '')) refuse('A database path and full 40-character --deployed-sha are required.');
  const requested = path.resolve(database);
  const stat = lstatSync(requested);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 100) refuse('Snapshot must be an existing regular SQLite file, not a symlink.');
  const file = realpathSync(requested);
  assertStandalone(file);
  const original = fingerprintFile(file);
  if (original.header.subarray(0,16).toString('binary') !== 'SQLite format 3\0') refuse('Snapshot is not a SQLite database.');
  // Read-only SQLite may create WAL shared-memory files. Require rollback mode
  // rather than immutable=1 (which can silently ignore committed WAL content).
  if (original.header[18] !== 1 || original.header[19] !== 1) refuse('Snapshot is still in WAL mode. Finalize journal_mode=DELETE on the separate snapshot only, never on the live database.');
  const hash = original.sha256;
  if (expectedSnapshotSha !== undefined && expectedSnapshotSha !== hash) {
    refuse('Snapshot SHA-256 does not match the expected review snapshot.');
  }
  const db = new Database(file, { readonly: true, fileMustExist: true });
  let result;
  try {
    db.pragma('query_only = ON');
    result = db.transaction(() => inventory(db, {
      generatedAt: new Date().toISOString(), snapshotSha256: hash,
      deployedApplication: { sha: deployedSha.toLowerCase(), source:'operator-supplied; not verified against a running server' },
    }))();
  } finally { db.close(); }
  assertStandalone(file);
  if (fingerprintFile(file).sha256 !== hash) refuse('Snapshot changed during inspection; discard the report and use a stable independent snapshot.');
  return result;
}

export function parseArguments(args) {
  const options = {};
  const valueFlags = {
    '--database': 'database',
    '--deployed-sha': 'deployedSha',
    '--details-output': 'detailsOutput',
    '--review-output': 'reviewOutput',
    '--verify-review': 'verifyReview',
    '--expected-snapshot-sha': 'expectedSnapshotSha',
  };
  for (let i=0;i<args.length;i++) {
    const flag = args[i];
    if (flag === '--snapshot') {
      if (options.snapshot) refuse('Duplicate --snapshot argument.');
      options.snapshot = true;
    } else if (Object.hasOwn(valueFlags, flag)) {
      const key = valueFlags[flag];
      const value = args[++i];
      if (options[key] || !value || value.startsWith('--')) refuse('Missing or duplicate inventory argument.');
      options[key] = value;
    } else refuse('Unknown inventory argument. Use --help.');
  }
  if (options.reviewOutput && !options.expectedSnapshotSha) {
    refuse('Review output requires the previously recorded --expected-snapshot-sha.');
  }
  if (options.verifyReview && (!options.expectedSnapshotSha || options.detailsOutput || options.reviewOutput)) {
    refuse('Review verification requires --expected-snapshot-sha and cannot be combined with output files.');
  }
  if (options.expectedSnapshotSha && !/^[a-f0-9]{64}$/.test(options.expectedSnapshotSha)) {
    refuse('Review snapshot SHA-256 must contain 64 lowercase hexadecimal characters.');
  }
  return options;
}

function reviewWorksheet(summary, details) {
  const pending = { decision: null, rationale: null };
  const integrity = [
    ['catalog_issue', details.catalogIssues],
    ['dangling_assignment', details.danglingAssignments],
    ['foreign_key_violation', details.foreignKeyViolations],
    ['orphan_course_code', details.orphanCourseCodes],
  ];
  return {
    version: 1,
    status: 'pending',
    snapshotSha256: summary.snapshotSha256,
    schemaFingerprintSha256: summary.schema.fingerprintSha256,
    deployedSha: summary.deployedApplication.sha,
    reviewReference: null,
    reviewer: null,
    reviewedAt: null,
    acceptCurrentRbacAsAuthoritative: false,
    accountDecisions: details.accounts.map(account => ({
      userId: account.userId,
      currentRoleIds: account.roleIds,
      flags: account.flags,
      scopeObservations: account.scopeObservations,
      ...pending,
    })),
    learnerProfileDecisions: details.accounts.flatMap(account => {
      const flags = account.flags.filter(flag => flag === 'learner_profile_missing' || flag === 'multiple_learner_profiles');
      return flags.length ? [{ userId: account.userId, flags, ...pending }] : [];
    }),
    integrityDecisions: integrity.flatMap(([kind, rows]) => rows.map(row => ({ kind, reference: row, ...pending }))),
    installedClientEvidence: null,
    legacyEndpointUsageEvidence: null,
  };
}

function readReview(filename) {
  const file = path.resolve(filename);
  const limit = 8 * 1024 * 1024;
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > limit || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    refuse('Review file must be a private regular file of at most 8 MiB.');
  }
  const fd = openSync(file, 'r');
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size || opened.mode !== stat.mode) {
      refuse('Review file changed while being opened.');
    }
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length !== stat.size || fstatSync(fd).mtimeMs !== stat.mtimeMs) {
      refuse('Review file changed while being read.');
    }
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}

function verifyReview(filename, expected) {
  const bytes = readReview(filename);
  let review;
  try { review = JSON.parse(bytes.toString('utf8')); }
  catch { refuse('Review file is not valid JSON.'); }
  if (review?.version !== expected.version || review.snapshotSha256 !== expected.snapshotSha256 ||
      review.schemaFingerprintSha256 !== expected.schemaFingerprintSha256 || review.deployedSha !== expected.deployedSha) {
    refuse('Review binding does not match the inspected snapshot and deployment revision.');
  }

  const filled = value => typeof value === 'string' && value.trim().length > 0;
  const reviewedAt = filled(review.reviewedAt) ? Date.parse(review.reviewedAt) : NaN;
  if (review.status !== 'reviewed' || review.acceptCurrentRbacAsAuthoritative !== true ||
      ![review.reviewer, review.reviewReference, review.installedClientEvidence, review.legacyEndpointUsageEvidence].every(filled) ||
      !Number.isFinite(reviewedAt) || reviewedAt > Date.now() || new Date(reviewedAt).toISOString() !== review.reviewedAt) {
    refuse('Review is incomplete. Record reviewer, UTC date, RBAC decision and both client evidence references.');
  }

  const groups = ['accountDecisions', 'learnerProfileDecisions', 'integrityDecisions'];
  for (const group of groups) {
    const rows = review[group];
    if (!Array.isArray(rows) || rows.length !== expected[group].length) {
      refuse('Review finding rows do not match the inspected snapshot.');
    }
    if (!rows.every(row => filled(row?.decision) && filled(row.rationale))) {
      refuse('Review is incomplete. Record a decision and rationale for every finding.');
    }
    const originalRows = rows.map(row => ({ ...row, decision: null, rationale: null }));
    if (!isDeepStrictEqual(originalRows, expected[group])) {
      refuse('Review finding rows do not match the inspected snapshot.');
    }
  }

  return {
    status: 'REVIEW_RECORD_VERIFIED',
    reviewSha256: sha256(bytes),
    snapshotSha256: expected.snapshotSha256,
    deployedSha: expected.deployedSha,
    findingCounts: Object.fromEntries(groups.map(group => [group, expected[group].length])),
    migrationReady: false,
  };
}

export function writePrivateDetails(filename, details) {
  // Exclusive creation rejects existing files/symlinks. Windows also requires a
  // private parent directory with operator-controlled ACLs; mode alone is not an ACL.
  const fd = openSync(path.resolve(filename), 'wx', 0o600);
  try {
    if (!fstatSync(fd).isFile()) refuse('Details output must be a regular file.');
    writeFileSync(fd, JSON.stringify(details,null,2)+'\n');
  } finally { closeSync(fd); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Usage: node scripts/rbac-inventory.mjs --snapshot --database /private/finalized-snapshot.db --deployed-sha <40 hex characters> [--details-output /private/new-exceptions.json] [--review-output /private/new-review.json --expected-snapshot-sha <64 lowercase hex characters>] [--verify-review /private/completed-review.json --expected-snapshot-sha <64 lowercase hex characters>]\nNo application imports, env files, network calls, schema upgrades, grants or database writes. Private outputs contain identifiers. See docs/release/LMS-010-PRIVATE-REVIEW.md.');
  } else {
    try {
      const options = parseArguments(process.argv.slice(2));
      const {summary,details} = inspectSnapshot(options);
      if (options.detailsOutput) writePrivateDetails(options.detailsOutput,details);
      if (options.reviewOutput) writePrivateDetails(options.reviewOutput,reviewWorksheet(summary,details));
      const result = options.verifyReview ? verifyReview(options.verifyReview, reviewWorksheet(summary,details)) : summary;
      console.log(JSON.stringify(result,null,2));
    } catch (error) {
      // Do not echo raw SQLite/path errors, which can include account data or SQL.
      const known = /^(Snapshot |Unsupported snapshot |Explicit --snapshot|A database path|Missing or duplicate|Unknown inventory|Duplicate --snapshot|Review (output requires|snapshot SHA-256|verification requires|file |binding |is incomplete|finding rows))/;
      console.error('RBAC inventory refused: '+(known.test(error.message) ? error.message : 'Unable to inspect the snapshot or exclusively create the private report. Check the input schema, file existence and directory permissions.'));
      process.exitCode = 2;
    }
  }
}
