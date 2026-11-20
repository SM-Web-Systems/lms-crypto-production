// Records activations that were sent straight to AmmaWallet's partner API (not through the LMS queue) as
// 'confirmed' rows in amma_activations, so the LMS knows about them and never queues a second, paid request.
//
// Offline tool. Never import application modules: database.ts migrates on import.
// Dry run by default (opens the database read-only). Writing needs --apply and --confirm "BACKFILL <count>".
// It never sends anything to AmmaWallet or the network.
//
//   node scripts/backfill-amma-activations.mjs --database <file> --input <csv>
//   node scripts/backfill-amma-activations.mjs --database <file> --input <csv> --apply --confirm "BACKFILL 14"
//
// CSV header (one row per activation, values from the send log or AmmaWallet's reconciliation):
//   email,amma_user_id,completion_id,idempotency_key,task_key,completed_at[,remote_activation_id][,tx_hash]
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BACKFILL_STATE = 'backfilled_direct_send';
const REQUIRED_COLUMNS = ['email', 'amma_user_id', 'completion_id', 'idempotency_key', 'task_key', 'completed_at'];
const TABLE_COLUMNS = ['id', 'completion_id', 'idempotency_key', 'user_id', 'amma_user_id', 'task_key', 'completed_at', 'status',
  'remote_activation_id', 'remote_state', 'tx_hash', 'attempts', 'next_attempt_at', 'last_error', 'created_at', 'updated_at'];

export function parseArguments(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--database' || a === '--input' || a === '--confirm') out[a.slice(2)] = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.database || !out.input) throw new Error('Pass --database <file> and --input <csv>.');
  return out;
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) throw new Error('The input file is empty.');
  const header = lines[0].split(',').map((h) => h.trim());
  for (const c of REQUIRED_COLUMNS) if (!header.includes(c)) throw new Error(`The input is missing the column "${c}".`);
  return lines.slice(1).map((line, n) => {
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length !== header.length) throw new Error(`Input line ${n + 2} has ${cells.length} values, expected ${header.length}. Values cannot contain commas.`);
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i] === '' ? null : cells[i]]));
    for (const c of REQUIRED_COLUMNS) if (!row[c]) throw new Error(`Input line ${n + 2} has no ${c}.`);
    if (!/^\d+$/.test(row.amma_user_id)) throw new Error(`Input line ${n + 2}: amma_user_id must be a whole number.`);
    if (Number.isNaN(Date.parse(row.completed_at))) throw new Error(`Input line ${n + 2}: completed_at is not a date.`);
    return { ...row, amma_user_id: Number(row.amma_user_id), line: n + 2 };
  });
}

/** Works out what would be written. Reads only. Throws on anything that needs a person to look first. */
export function planBackfill(db, rows) {
  const columns = db.prepare('PRAGMA table_info("amma_activations")').all().map((c) => c.name);
  if (columns.length === 0) throw new Error('This database has no amma_activations table. Nothing was changed.');
  const missing = TABLE_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) throw new Error(`amma_activations is missing columns (${missing.join(', ')}). Nothing was changed.`);
  const hasLinks = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='amma_wallet_links'").get() != null;

  const seen = new Set();
  const plan = [];
  const problems = [];
  for (const r of rows) {
    for (const key of [`c:${r.completion_id}`, `k:${r.idempotency_key}`]) {
      if (seen.has(key)) problems.push(`line ${r.line}: ${key.startsWith('c') ? 'completion_id' : 'idempotency_key'} appears twice in the input`);
      seen.add(key);
    }
    const users = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').all(r.email);
    if (users.length !== 1) { problems.push(`line ${r.line}: ${users.length === 0 ? 'no LMS user' : 'more than one LMS user'} has this email`); continue; }
    const userId = users[0].id;
    if (hasLinks) {
      const link = db.prepare('SELECT amma_user_id FROM amma_wallet_links WHERE user_id = ?').get(userId);
      if (link && link.amma_user_id !== r.amma_user_id) problems.push(`line ${r.line}: amma_user_id ${r.amma_user_id} differs from the stored Amma link (${link.amma_user_id})`);
    }
    const byCompletion = db.prepare('SELECT * FROM amma_activations WHERE completion_id = ? OR idempotency_key = ?').all(r.completion_id, r.idempotency_key);
    if (byCompletion.length) {
      const same = byCompletion.length === 1 && byCompletion[0].user_id === userId && byCompletion[0].completion_id === r.completion_id
        && byCompletion[0].idempotency_key === r.idempotency_key && byCompletion[0].status === 'confirmed';
      if (same) { plan.push({ action: 'skip', reason: 'already recorded as confirmed', line: r.line, userId, completionId: r.completion_id }); continue; }
      problems.push(`line ${r.line}: a different activation row already uses this completion_id or idempotency_key (status ${byCompletion[0].status})`);
      continue;
    }
    const open = db.prepare("SELECT completion_id, status FROM amma_activations WHERE user_id = ? AND task_key = ? AND status IN ('queued','submitted','blocked')").all(userId, r.task_key);
    if (open.length) {
      problems.push(`line ${r.line}: this user already has a ${open[0].status} activation for ${r.task_key} (completion ${open[0].completion_id}); the queue would send it, so decide which one stands before backfilling`);
      continue;
    }
    plan.push({ action: 'insert', line: r.line, userId, row: r });
  }
  return { plan, problems };
}

export function applyBackfill(db, plan, nowMs = Date.now()) {
  const insert = db.prepare(`INSERT INTO amma_activations (id, completion_id, idempotency_key, user_id, amma_user_id, task_key, completed_at, status,
      remote_activation_id, remote_state, tx_hash, attempts, next_attempt_at, last_error, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,'confirmed',?,?,?,1,?,NULL,?,?)`);
  let written = 0;
  db.transaction(() => {
    for (const p of plan) {
      if (p.action !== 'insert') continue;
      const r = p.row;
      const completedMs = Date.parse(r.completed_at);
      insert.run(randomUUID(), r.completion_id, r.idempotency_key, p.userId, r.amma_user_id, r.task_key, new Date(completedMs).toISOString(),
        r.remote_activation_id ?? null, BACKFILL_STATE, r.tx_hash ?? null, nowMs, completedMs, nowMs);
      written++;
    }
  }).immediate();
  return written;
}

export function run(argv, log = console.log) {
  const args = parseArguments(argv);
  const rows = parseCsv(readFileSync(args.input, 'utf8'));
  const db = new Database(args.database, { readonly: !args.apply, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    const { plan, problems } = planBackfill(db, rows);
    const inserts = plan.filter((p) => p.action === 'insert');
    for (const p of plan) log(`${p.action === 'insert' ? 'WOULD RECORD' : 'SKIP'} line ${p.line}: user ${p.userId}, completion ${p.action === 'insert' ? p.row.completion_id : p.completionId}${p.reason ? ` (${p.reason})` : ''}`);
    if (problems.length) {
      for (const p of problems) log(`PROBLEM ${p}`);
      throw new Error(`${problems.length} problem(s) found. Nothing was changed.`);
    }
    log(`${inserts.length} row(s) to record, ${plan.length - inserts.length} already recorded.`);
    if (!args.apply) { log('Dry run: nothing was changed. Add --apply --confirm "BACKFILL ' + inserts.length + '" to write.'); return { written: 0, planned: inserts.length }; }
    if (args.confirm !== `BACKFILL ${inserts.length}`) throw new Error(`To write, pass --confirm "BACKFILL ${inserts.length}". Nothing was changed.`);
    const written = applyBackfill(db, plan);
    log(`Recorded ${written} activation(s) as confirmed (${BACKFILL_STATE}). Nothing was sent to AmmaWallet.`);
    return { written, planned: inserts.length };
  } finally { db.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { run(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
