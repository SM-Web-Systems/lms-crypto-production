// Real SQLite persistence, additive upgrade and process concurrency on synthetic data only.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';

const server = fileURLToPath(new URL('..', import.meta.url));
if (process.argv[2] === '--worker') {
  const {db, close} = await import(pathToFileURL(path.join(server, 'dist/config/database.js')).href);
  const {fundRewardAsync} = await import(pathToFileURL(path.join(server, 'dist/services/rewards/rewardService.js')).href);
  process.send?.({ready: true});
  await once(process, 'message');
  try {
    const reward = await fundRewardAsync('reward', 'authorizer', {type: 'admin_grant', reference: 'synthetic-grant'}, process.argv[3]);
    process.send?.({status: reward.status});
  } catch (error) {
    process.send?.({error: error.code ?? error.message});
  } finally { close(); process.disconnect?.(); }
} else {
  const directory = mkdtempSync(path.join(tmpdir(), 'lms-funding-runtime-'));
  const file = path.join(directory, 'synthetic.db');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    ['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'].includes(name.toUpperCase())));
  Object.assign(env, {DATABASE_PATH: file, NODE_ENV: 'production'});
  const children = new Set();
  let db;
  async function worker(key) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', key],
      {cwd: directory, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
    children.add(child);
    let stderr = '';
    child.stderr.on('data', value => {stderr += value;});
    child.stdout.resume();
    const timeout = setTimeout(() => child.kill(), 60000);
    const result = new Promise((resolve, reject) => {
      let message;
      child.on('message', value => { if (!value.ready) message = value; });
      child.on('error', reject);
      child.on('exit', code => {
        clearTimeout(timeout); children.delete(child);
        if (code !== 0 || !message) reject(new Error(`Funding worker exited ${code}: ${stderr}`));
        else resolve(message);
      });
    });
    // Register exit rejection before waiting for readiness; a failed bootstrap
    // must fail the drill rather than leave a stale marker masquerading as work.
    await Promise.race([once(child, 'message'), result.then(() => {throw new Error('Worker exited before readiness');})]);
    return {child, result};
  }
  try {
    const initialized = spawnSync(process.execPath, [path.join(server, 'dist/scripts/initDb.js'), '--initialize-new'],
      {cwd: directory, env, windowsHide: true, encoding: 'utf8', timeout: 60000});
    assert.equal(initialized.status, 0, initialized.stderr);
    db = new Database(file);
    // Recreate the pre-funding-table state, keeping all existing data/history.
    for (const name of ['reward_funding_intent_immutable', 'reward_funding_intent_no_delete', 'reward_funding_evidence_no_update', 'reward_funding_evidence_no_delete']) db.exec(`DROP TRIGGER ${name}`);
    db.exec('DROP TABLE platform_credit_consumptions; DROP TABLE platform_credit_reservations; DROP TABLE platform_credit_grants; DROP TABLE platform_credit_requests; DROP TABLE platform_backing_deposits; DROP TABLE platform_backing_intents; DROP TABLE platform_credit_audit; DROP TABLE reward_stellar_funding_evidence; DROP TABLE reward_stellar_funding_bindings; DROP TABLE reward_funding_evidence; DROP TABLE reward_funding_intents');
    db.exec(`INSERT INTO users(id,name,email,password_hash,role) VALUES
      ('owner','Synthetic','owner@example.invalid','synthetic','student'),
      ('authorizer','Synthetic','authorizer@example.invalid','synthetic','admin');
      INSERT INTO user_roles(user_id,role_id) VALUES ('authorizer','role_admin');
      INSERT INTO courses(id,title,course_code) VALUES ('course','Funding','FUNDING');
      INSERT INTO sponsor_cohorts(id,sponsor_user_id,course_id,name) VALUES ('cohort','owner','course','Funding');
      INSERT INTO rewards(id,creator_user_id,scope_type,scope_id,reward_type,amount_stroops,max_recipients,idempotency_key)
        VALUES ('reward','owner','sponsor_cohort','cohort','custom',101,3,'create');`);
    db.close(); db = undefined;
    // Each worker opens the real compiled application in its own process. The
    // first startup must add empty funding tables without fabricating evidence.
    const first = await worker('same-funding-request');
    db = new Database(file, {readonly: true});
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reward_funding_intents').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reward_transactions').get().n, 0);
    db.close(); db = undefined;
    const rest = await Promise.all([worker('same-funding-request'), worker('same-funding-request')]);
    for (const entry of [first, ...rest]) entry.child.send({go: true});
    const results = await Promise.all([first, ...rest].map(entry => entry.result));
    assert.ok(results.some(result => result.status === 'funded'));
    for (const result of results) assert.deepEqual(result, {status: 'funded'});
    // A new process retries the same operation after all prior processes exit.
    const restarted = await worker('same-funding-request'); restarted.child.send({go: true});
    assert.deepEqual(await restarted.result, {status: 'funded'});
    const different = await worker('different-funding-request'); different.child.send({go: true});
    assert.ok((await different.result).error, 'a new key cannot fund a funded reward twice');
    db = new Database(file, {readonly: true});
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reward_funding_intents').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reward_funding_evidence').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reward_transactions').get().n, 2);
    assert.deepEqual(db.prepare('SELECT available_stroops,reserved_stroops FROM reward_accounts').all(), [{available_stroops: 0, reserved_stroops: 303}]);
    assert.equal(db.pragma('quick_check', {simple: true}), 'ok');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    console.log(JSON.stringify({syntheticOnly: true, additiveUpgrade: 'EMPTY_INTENTS_NO_SYNTHETIC_EVIDENCE',
      concurrentProcesses: results, restartedReplay: 'ONE_CREDIT_ONE_RESERVATION', newKeyReplay: 'REFUSED', integrity: 'PASS'}));
  } finally {
    db?.close();
    for (const child of children) child.kill();
    await Promise.all([...children].map(child => once(child, 'exit').catch(() => {})));
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('lms-funding-runtime-'));
    rmSync(directory, {recursive: true, force: true});
  }
}
