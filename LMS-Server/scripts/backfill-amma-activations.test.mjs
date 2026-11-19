import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, BACKFILL_STATE } from './backfill-amma-activations.mjs';

const tsSchema = (file) => readFileSync(new URL(`../src/config/${file}`, import.meta.url), 'utf8').match(/`([\s\S]*?)`/)[1];
const HEADER = 'email,amma_user_id,completion_id,idempotency_key,task_key,completed_at,remote_activation_id,tx_hash';
const SPONSOR = 'tester+sponsor-a@smwebsystems.com,381,sponsor-onboarded-u-sponsor,lms-activate-sponsor-onboarded-u-sponsor,lms:sponsor-onboarded,2026-11-19T13:42:00Z,act_21,abc';
const TEACHER = 'tester+teacher-a@smwebsystems.com,382,staff-u-teacher,lms-activate-staff-u-teacher,lms:course-complete,2026-11-19T13:43:00Z,,';

function fixture(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lms-backfill-'));
  const file = path.join(dir, 'lms.db');
  const db = new Database(file);
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, walletAddress TEXT)');
  db.exec(tsSchema('ammaActivationSchema.ts'));
  db.exec(tsSchema('ammaWalletLinkSchema.ts'));
  db.prepare("INSERT INTO users VALUES ('u-sponsor','tester+sponsor-a@smwebsystems.com','GSP'),('u-teacher','tester+teacher-a@smwebsystems.com','GTE')").run();
  db.close();
  const csv = (lines) => { const p = path.join(dir, 'in.csv'); writeFileSync(p, [HEADER, ...lines].join('\n')); return p; };
  const open = () => new Database(file);
  try { return fn({ file, csv, open }); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const quiet = () => {};

test('dry run reports the plan and changes nothing', () => fixture(({ file, csv, open }) => {
  const out = [];
  const result = run(['--database', file, '--input', csv([SPONSOR, TEACHER])], (l) => out.push(l));
  assert.deepEqual(result, { written: 0, planned: 2 });
  assert.match(out.join('\n'), /Dry run: nothing was changed/);
  const db = open(); assert.equal(db.prepare('SELECT count(*) n FROM amma_activations').get().n, 0); db.close();
}));

test('apply needs the exact confirmation', () => fixture(({ file, csv, open }) => {
  assert.throws(() => run(['--database', file, '--input', csv([SPONSOR, TEACHER]), '--apply', '--confirm', 'BACKFILL 14'], quiet), /BACKFILL 2/);
  const db = open(); assert.equal(db.prepare('SELECT count(*) n FROM amma_activations').get().n, 0); db.close();
}));

test('apply records confirmed rows that the activation worker will never send, and a rerun is a no-op', () => fixture(({ file, csv, open }) => {
  const input = csv([SPONSOR, TEACHER]);
  assert.equal(run(['--database', file, '--input', input, '--apply', '--confirm', 'BACKFILL 2'], quiet).written, 2);
  const db = open();
  const rows = db.prepare('SELECT * FROM amma_activations ORDER BY completion_id').all();
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.status === 'confirmed' && r.remote_state === BACKFILL_STATE && r.last_error === null));
  assert.equal(rows[0].user_id, 'u-sponsor'); assert.equal(rows[0].remote_activation_id, 'act_21'); assert.equal(rows[0].tx_hash, 'abc');
  // Same query as processActivations(): backfilled rows are never picked up for sending.
  assert.equal(db.prepare("SELECT count(*) n FROM amma_activations WHERE status IN ('queued','submitted','blocked')").get().n, 0);
  db.close();
  const again = run(['--database', file, '--input', input, '--apply', '--confirm', 'BACKFILL 0'], quiet);
  assert.equal(again.written, 0);
}));

test('the sponsor trigger finds the backfilled row and does not queue a second paid request', () => fixture(({ file, csv, open }) => {
  run(['--database', file, '--input', csv([SPONSOR]), '--apply', '--confirm', 'BACKFILL 1'], quiet);
  const db = open();
  // enqueueActivation() looks up completion_id first; sponsorActivationService uses sponsor-onboarded-<sponsor id>.
  assert.ok(db.prepare('SELECT id FROM amma_activations WHERE completion_id = ?').get('sponsor-onboarded-u-sponsor'));
  db.close();
}));

test('refuses, writing nothing, when the user is unknown, the Amma id disagrees, or a live row would still be sent', () => fixture(({ file, csv, open }) => {
  const unknown = SPONSOR.replace('sponsor-a@', 'nobody@');
  assert.throws(() => run(['--database', file, '--input', csv([unknown, TEACHER]), '--apply', '--confirm', 'BACKFILL 1'], quiet), /problem/);
  let db = open();
  db.prepare("INSERT INTO amma_wallet_links (user_id, amma_user_id, wallet_address, imported_at) VALUES ('u-teacher', 999, 'GTE', datetime('now'))").run();
  db.close();
  assert.throws(() => run(['--database', file, '--input', csv([TEACHER])], quiet), /problem/);
  db = open();
  db.prepare('DELETE FROM amma_wallet_links').run();
  db.prepare(`INSERT INTO amma_activations (id, completion_id, idempotency_key, user_id, amma_user_id, task_key, completed_at, status, attempts, next_attempt_at, created_at, updated_at)
    VALUES ('x','other','lms-activate-other','u-teacher',382,'lms:course-complete','2026-11-19','queued',0,0,0,0)`).run();
  db.close();
  const out = [];
  assert.throws(() => run(['--database', file, '--input', csv([TEACHER])], (l) => out.push(l)), /problem/);
  assert.match(out.join('\n'), /already has a queued activation/);
  db = open(); assert.equal(db.prepare('SELECT count(*) n FROM amma_activations').get().n, 1); db.close();
}));
