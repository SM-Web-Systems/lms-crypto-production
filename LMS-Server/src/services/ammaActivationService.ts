import { createHash, createPrivateKey, sign, type KeyObject } from 'node:crypto';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { db } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Asks AmmaWallet to activate a learner's wallet after a confirmed certificate (partner activation API).
 * Runs as its own step with its own queue: nothing here can block or undo a mint. Off unless AMMA_ACTIVATION_ENABLED=on.
 *
 * Signature (AmmaWallet's contract): "amma-partner-v1\n" + METHOD + "\n" + path + "\n" + timestamp + "\n" + hex(sha256(rawBody)),
 * Ed25519, sent as X-Amma-Signature: ed25519=<base64>, with X-Amma-Key-Id, X-Amma-Timestamp and the tenant X-Api-Key.
 */
export const ACTIVATION_PATH = '/api/v1/partner/activations';
const MINUTE = 60_000;
const RETRY_SCHEDULE_MS = [1 * MINUTE, 5 * MINUTE, 30 * MINUTE, 2 * 60 * MINUTE, 12 * 60 * MINUTE];
const GIVE_UP_AFTER_MS = 24 * 60 * MINUTE;
const POLL_MS = 30_000;

export interface ActivationConfig { baseUrl: string; apiKey: string; keyId: string; privateKey: KeyObject; taskKey: string }
export interface ActivationInput { userId: string; ammaUserId: number; completionId: string; completedAt?: string; taskKey?: string }
type Row = { id: string; completion_id: string; idempotency_key: string; user_id: string; amma_user_id: number; task_key: string; completed_at: string;
  status: string; remote_activation_id: string | null; remote_state: string | null; tx_hash: string | null; attempts: number; next_attempt_at: number;
  last_error: string | null; created_at: number; updated_at: number };

export function activationConfig(env: NodeJS.ProcessEnv = process.env): ActivationConfig | null {
  if (env.AMMA_ACTIVATION_ENABLED !== 'on') return null;
  const { AMMA_ACTIVATION_BASE_URL: baseUrl, AMMA_ACTIVATION_API_KEY: apiKey, AMMA_ACTIVATION_KEY_ID: keyId, AMMA_ACTIVATION_PRIVATE_KEY_FILE: keyFile } = env;
  if (!baseUrl || !apiKey || !keyId || !keyFile || !/^https:\/\//.test(baseUrl) || !/^[A-Za-z0-9_-]{4,64}$/.test(keyId)) return null;
  try {
    const privateKey = createPrivateKey(fs.readFileSync(keyFile));
    if (privateKey.asymmetricKeyType !== 'ed25519') return null;
    return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, keyId, privateKey, taskKey: env.AMMA_ACTIVATION_TASK_KEY || 'lms:course-complete' };
  } catch { return null; }
}

export const canonicalString = (method: string, path: string, timestamp: string, rawBody: string): string =>
  ['amma-partner-v1', method.toUpperCase(), path, timestamp, createHash('sha256').update(rawBody).digest('hex')].join('\n');

export function signedHeaders(cfg: ActivationConfig, method: string, path: string, rawBody: string, nowMs = Date.now()): Record<string, string> {
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = sign(null, Buffer.from(canonicalString(method, path, timestamp, rawBody)), cfg.privateKey).toString('base64');
  return { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'x-amma-key-id': cfg.keyId, 'x-amma-timestamp': timestamp, 'x-amma-signature': `ed25519=${signature}` };
}

/** Adds one activation to the queue. Idempotent: the same completion is queued once, and its idempotency key never changes. */
export function enqueueActivation(input: ActivationInput, nowMs = Date.now()): { id: string; created: boolean } {
  const existing = db.prepare('SELECT id FROM amma_activations WHERE completion_id = ?').get(input.completionId) as { id: string } | undefined;
  if (existing) return { id: existing.id, created: false };
  const id = uuid();
  db.prepare(`INSERT INTO amma_activations (id, completion_id, idempotency_key, user_id, amma_user_id, task_key, completed_at, status, attempts, next_attempt_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,'queued',0,?,?,?)`).run(id, input.completionId, `lms-activate-${input.completionId}`, input.userId, input.ammaUserId,
    input.taskKey ?? 'lms:course-complete', input.completedAt ?? new Date(nowMs).toISOString(), nowMs, nowMs, nowMs);
  return { id, created: true };
}

function update(row: Row, patch: Partial<Row>, nowMs: number) {
  const next = { ...row, ...patch, updated_at: nowMs };
  db.prepare(`UPDATE amma_activations SET status=?, remote_activation_id=?, remote_state=?, tx_hash=?, attempts=?, next_attempt_at=?, last_error=?, updated_at=? WHERE id=?`)
    .run(next.status, next.remote_activation_id, next.remote_state, next.tx_hash, next.attempts, next.next_attempt_at, next.last_error, next.updated_at, row.id);
}

const BLOCKED_SLOW = new Set(['NOT_ELIGIBLE', 'WALLET_NOT_AMMA_HELD', 'ACCOUNT_FROZEN', 'EMAIL_NOT_VERIFIED', 'ACCOUNT_TOO_NEW']);
const BLOCKED_BUDGET = new Set(['BUDGET_EXHAUSTED', 'ACTIVATION_PAUSED', 'ACTIVATION_OFF', 'ACTIVATION_NOT_ENABLED', 'CAP_REACHED', 'DAILY_CAP_REACHED']);
const CONFIG_PROBLEM = new Set(['API_KEY_REQUIRED', 'ACCESS_DENIED', 'SCOPE_REQUIRED', 'SIGNATURE_INVALID']);

function backoff(row: Row, nowMs: number): number {
  const wait = RETRY_SCHEDULE_MS[Math.min(Math.max(row.attempts - 1, 0), RETRY_SCHEDULE_MS.length - 1)];
  return nowMs + wait;
}

type Remote = { status?: number; body?: { activationId?: string; status?: string; chains?: { state?: string; txHash?: string }[]; error?: { code?: string } }; networkError?: boolean };

async function call(cfg: ActivationConfig, method: 'POST' | 'GET', path: string, body: string): Promise<Remote> {
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, { method, headers: signedHeaders(cfg, method, path, body), ...(method === 'POST' ? { body } : {}), redirect: 'error', signal: AbortSignal.timeout(10_000) });
    const json = await res.json().catch(() => undefined) as Remote['body'];
    return { status: res.status, body: json };
  } catch { return { networkError: true }; }
}

/** Handles the answer from AmmaWallet for one queue row. Never throws. */
function applyResult(row: Row, remote: Remote, nowMs: number) {
  const attempts = row.attempts + 1;
  if (remote.networkError || (remote.status && (remote.status >= 500 || remote.status === 429))) {
    const failedForGood = nowMs - row.created_at > GIVE_UP_AFTER_MS;
    update(row, { attempts, status: failedForGood ? 'failed' : row.status, next_attempt_at: backoff({ ...row, attempts }, nowMs), last_error: remote.networkError ? 'network' : `http_${remote.status}` }, nowMs);
    if (failedForGood) logger.error({ module: 'amma-activation', completion: row.completion_id }, 'Activation gave up after 24 hours');
    return;
  }
  if (remote.status === 200 || remote.status === 202) {
    const view = remote.body ?? {};
    const state = view.status ?? 'pending';
    const tx = view.chains?.find(c => c.txHash)?.txHash ?? row.tx_hash;
    const status = state === 'confirmed' || state === 'skipped' ? 'confirmed' : state === 'failed' ? 'failed' : 'submitted';
    update(row, { attempts: status === 'submitted' ? row.attempts : attempts, status, remote_activation_id: view.activationId ?? row.remote_activation_id, remote_state: state, tx_hash: tx ?? null,
      next_attempt_at: status === 'submitted' ? nowMs + POLL_MS : nowMs, last_error: status === 'failed' ? 'remote_failed' : null }, nowMs);
    return;
  }
  const code = remote.body?.error?.code ?? `http_${remote.status ?? 'unknown'}`;
  if (BLOCKED_BUDGET.has(code) || remote.status === 402) {
    update(row, { attempts, status: 'blocked', next_attempt_at: nowMs + 30 * MINUTE, last_error: code }, nowMs);
    logger.warn({ module: 'amma-activation', code }, 'Activation is waiting: AmmaWallet budget or switch');
  } else if (BLOCKED_SLOW.has(code)) {
    update(row, { attempts, status: 'blocked', next_attempt_at: nowMs + 6 * 60 * MINUTE, last_error: code }, nowMs);
  } else if (CONFIG_PROBLEM.has(code)) {
    update(row, { attempts, status: 'blocked', next_attempt_at: nowMs + 30 * MINUTE, last_error: code }, nowMs);
    logger.error({ module: 'amma-activation', code }, 'Activation request refused: check the key, key id and clock');
  } else {
    update(row, { attempts, status: 'failed', last_error: code }, nowMs);
  }
}

/** Processes every due row once: sends new ones, polls submitted ones. Returns how many rows were handled. */
export async function processActivations(nowMs = Date.now(), cfg: ActivationConfig | null = activationConfig()): Promise<number> {
  if (!cfg) return 0;
  const due = db.prepare(`SELECT * FROM amma_activations WHERE status IN ('queued','submitted','blocked') AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT 10`).all(nowMs) as Row[];
  for (const row of due) {
    if (row.remote_activation_id) {
      applyResult(row, await call(cfg, 'GET', `${ACTIVATION_PATH}/${encodeURIComponent(row.remote_activation_id)}`, ''), nowMs);
    } else {
      const body = JSON.stringify({ ammaUserId: row.amma_user_id, taskKey: row.task_key, completionId: row.completion_id, idempotencyKey: row.idempotency_key, completedAt: row.completed_at });
      applyResult(row, await call(cfg, 'POST', ACTIVATION_PATH, body), nowMs);
    }
  }
  return due.length;
}

/** What the learner may be told. Never mentions balances or budgets. */
export function activationStatusFor(userId: string): { state: 'none' | 'pending' | 'activated' | 'delayed'; message: string | null } {
  const row = db.prepare('SELECT status, attempts, last_error FROM amma_activations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId) as Pick<Row, 'status' | 'attempts' | 'last_error'> | undefined;
  if (!row) return { state: 'none', message: null };
  if (row.status === 'confirmed') return { state: 'activated', message: 'Wallet activated.' };
  if (row.status === 'failed' || row.attempts >= 3) return { state: 'delayed', message: "Activation is taking longer than usual, we're on it." };
  return { state: 'pending', message: 'Your wallet is being activated.' };
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
/** Every 30 seconds, only when AMMA_ACTIVATION_ENABLED=on and the configuration is complete. */
export function startAmmaActivationWorker(): void {
  if (timer || !activationConfig()) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void processActivations().catch(err => logger.error({ module: 'amma-activation', err }, 'Activation worker could not run')).finally(() => { running = false; });
  }, 30_000);
  timer.unref();
}
