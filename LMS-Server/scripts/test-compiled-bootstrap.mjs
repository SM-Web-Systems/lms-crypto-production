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
  assert.equal(run([cli, '--initialize-new']).status, 1, 'existing database must be refused');
  console.log('PASS: compiled initialization and restart without src, from an unrelated directory with spaces; no login accounts.');
} finally {
  rmSync(isolated, { recursive: true, force: true });
}
