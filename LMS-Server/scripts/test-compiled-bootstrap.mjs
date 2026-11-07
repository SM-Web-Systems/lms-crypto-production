// Source-free production-layout smoke test. Synthetic, disposable databases only.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const server = fileURLToPath(new URL('..', import.meta.url));
const isolated = mkdtempSync(path.join(tmpdir(), 'auth13 compiled runtime '));
try {
  cpSync(path.join(server, 'dist'), path.join(isolated, 'dist'), { recursive: true });
  cpSync(path.join(server, 'database'), path.join(isolated, 'database'), { recursive: true });
  cpSync(path.join(server, 'package.json'), path.join(isolated, 'package.json'));
  symlinkSync(path.join(server, 'node_modules'), path.join(isolated, 'node_modules'), 'junction');
  mkdirSync(path.join(isolated, 'unrelated working directory'));
  const file = path.join(isolated, 'new data', 'application.db');
  const env = { ...process.env, NODE_ENV: 'production', DATABASE_PATH: file };
  delete env.VITEST;
  const run = args => spawnSync(process.execPath, args, {
    cwd: path.join(isolated, 'unrelated working directory'), env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  const cli = path.join(isolated, 'dist', 'scripts', 'initDb.js');
  assert.equal(run([cli]).status, 1, 'unflagged initialization must refuse');
  assert.equal(existsSync(file), false);
  const initialized = run([cli, '--initialize-new']);
  assert.equal(initialized.status, 0, initialized.stderr);
  const runtime = pathToFileURL(path.join(isolated, 'dist/config/database.js')).href;
  const restarted = run(['--input-type=module', '-e', `
    const { db, close } = await import(${JSON.stringify(runtime)});
    if (db.prepare('SELECT COUNT(*) n FROM users').get().n !== 0) throw Error('Unexpected login account');
    if (db.pragma('foreign_keys', { simple: true }) !== 1) throw Error('Foreign keys disabled');
    close();
  `]);
  assert.equal(restarted.status, 0, restarted.stderr);
  const driver = pathToFileURL(path.join(isolated, 'node_modules/better-sqlite3/lib/index.js')).href;
  const beforeOfflineUpgrade = run(['--input-type=module', '-e', `
    const { default: Database } = await import(${JSON.stringify(driver)});
    const db = new Database(process.env.DATABASE_PATH, { fileMustExist: true });
    db.exec(${JSON.stringify([
      'DROP TRIGGER offline_learning_revoke_course_code_delete',
      'DROP TRIGGER offline_learning_revoke_course_code_update',
      'DROP TRIGGER offline_learning_revoke_course',
      'DROP TABLE offline_progress_receipts',
      'DROP TABLE offline_learning_leases',
      'DROP TABLE paystack_checkout_links',
    ].join('; '))});
    db.close();
  `]);
  assert.equal(beforeOfflineUpgrade.status, 0, beforeOfflineUpgrade.stderr);
  const migrated = run(['--input-type=module', '-e', `
    const { db, close } = await import(${JSON.stringify(runtime)});
    for (const table of ['offline_learning_leases', 'offline_progress_receipts', 'paystack_checkout_links']) {
      if (db.prepare('SELECT COUNT(*) n FROM ' + table).get().n !== 0) throw Error('Unexpected additive data');
    }
    if (db.pragma('foreign_key_check').length !== 0) throw Error('Offline upgrade introduced foreign-key violations');
    close();
  `]);
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.equal(run([cli, '--initialize-new']).status, 1, 'existing database must be refused');
  console.log('PASS: compiled initialization and restart without src, from an unrelated directory with spaces; no login accounts.');
  console.log('PASS: compiled additive upgrade recreated empty offline and Paystack checkout tables on the disposable database.');
} finally {
  rmSync(isolated, { recursive: true, force: true });
}
