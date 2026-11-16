/**
 * LMS-WP1: standards Web Push (RFC 8030 + VAPID RFC 8292 + aes128gcm RFC 8291)
 * for the LMS home-screen web app, including iPhone/iPad home-screen web apps (iOS 16.4+).
 *
 * Built on node:crypto only (no third-party push service, no new dependency).
 * Subscriptions are bound to the signed-in session exactly like native installations:
 * logout, session revocation, password change or role change stops delivery.
 * Payloads stay generic so lock screens never show private notification content.
 */
import { createECDH, createPrivateKey, createCipheriv, hkdfSync, randomBytes, randomUUID, sign, type ECDH, type KeyObject } from 'node:crypto';
import { db, hashToken } from '../config/database.js';
import { verifyToken } from '../config/jwt.js';
import { isWriterHoldActive } from './writerHold.js';
import logger from '../utils/logger.js';

export class WebPushError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const b64url = /^[A-Za-z0-9_-]+$/;
function fromB64url(value: string): Buffer { return Buffer.from(value, 'base64url'); }

/** Push services we deliver to. Restricting hosts prevents the server being used to POST to arbitrary URLs. */
const allowedPushHosts = [
  /^web\.push\.apple\.com$/,               // Safari / iOS / iPadOS home-screen web apps
  /^fcm\.googleapis\.com$/,                // Chrome, Edge on Android, most Chromium
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^[a-z0-9-]+\.notify\.windows\.com$/,    // Edge on Windows
];
export function isAllowedEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1024) return false;
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  return url.protocol === 'https:' && !url.username && !url.password && !url.port
    && allowedPushHosts.some(host => host.test(url.hostname));
}

export interface WebPushConfiguration { enabled: boolean; publicKey: string; subject: string; privateKey?: KeyObject }
let cachedKeys: { pub: string; priv: string; key: KeyObject } | undefined;
/** WEB_PUSH_ENABLED=true plus a VAPID key pair (base64url) and a mailto:/https: contact. Keys live only in the server environment. */
export function webPushConfiguration(): WebPushConfiguration {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? '';
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? '';
  const subject = process.env.WEB_PUSH_SUBJECT ?? '';
  const off = { enabled: false, publicKey: '', subject: '' };
  if (process.env.WEB_PUSH_ENABLED !== 'true' || !b64url.test(publicKey) || !b64url.test(privateKey)
    || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) return off;
  const pub = fromB64url(publicKey); const priv = fromB64url(privateKey);
  if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return off;
  if (!cachedKeys || cachedKeys.pub !== publicKey || cachedKeys.priv !== privateKey) {
    try {
      const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: privateKey,
        x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
      // Reject a private key that does not belong to the advertised public key.
      const derived = createECDH('prime256v1'); derived.setPrivateKey(priv);
      if (!derived.getPublicKey().equals(pub)) return off;
      cachedKeys = { pub: publicKey, priv: privateKey, key };
    } catch { return off; }
  }
  return { enabled: true, publicKey, subject, privateKey: cachedKeys.key };
}

/** RFC 8292 VAPID header for one push-service origin. */
export function vapidAuthorization(endpoint: string, config: WebPushConfiguration, now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: config.subject })).toString('base64url');
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: config.privateKey!, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `vapid t=${header}.${claims}.${signature}, k=${config.publicKey}`;
}

/** RFC 8291 aes128gcm message encryption for one subscription (single record). */
function newEphemeral() { const e = createECDH('prime256v1'); e.generateKeys(); return e; }
export function encryptPayload(plaintext: Buffer, p256dh: string, authSecret: string,
  ephemeral: ECDH = newEphemeral(), salt = randomBytes(16)): Buffer {
  const uaPublic = fromB64url(p256dh); const auth = fromB64url(authSecret);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || auth.length !== 16) throw new WebPushError(400, 'VALIDATION_ERROR', 'Invalid subscription keys.');
  const asPublic = ephemeral.getPublicKey();
  const shared = ephemeral.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

function validSubscription(value: unknown): { endpoint: string; p256dh: string; auth: string } {
  const v = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = v?.endpoint; const p256dh = v?.keys?.p256dh; const auth = v?.keys?.auth;
  if (typeof endpoint !== 'string' || !isAllowedEndpoint(endpoint)) throw new WebPushError(400, 'VALIDATION_ERROR', 'Unsupported push endpoint.');
  if (typeof p256dh !== 'string' || !b64url.test(p256dh.replace(/=+$/, '')) || typeof auth !== 'string' || !b64url.test(auth.replace(/=+$/, ''))) {
    throw new WebPushError(400, 'VALIDATION_ERROR', 'Invalid subscription keys.');
  }
  const pk = p256dh.replace(/=+$/, ''); const as = auth.replace(/=+$/, '');
  const pkRaw = fromB64url(pk);
  if (pkRaw.length !== 65 || pkRaw[0] !== 4 || fromB64url(as).length !== 16) throw new WebPushError(400, 'VALIDATION_ERROR', 'Invalid subscription keys.');
  try { newEphemeral().computeSecret(pkRaw); } // rejects points that are not on the P-256 curve
  catch { throw new WebPushError(400, 'VALIDATION_ERROR', 'Invalid subscription keys.'); }
  return { endpoint, p256dh: pk, auth: as };
}

const epoch = (value: string) => Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');

/** Binds this browser's subscription to the current session. Re-sent on each app open to renew the lease. */
export function saveSubscription(raw: unknown, token: string, now = Date.now()) {
  if (!webPushConfiguration().enabled) throw new WebPushError(503, 'PUSH_UNAVAILABLE', 'Web push is not configured.');
  const sub = validSubscription(raw);
  const jwt = verifyToken(token);
  return db.transaction(() => {
    const user = db.prepare('SELECT authorization_version,password_changed_at,deletion_status FROM users WHERE id=?').get(jwt.userId) as
      { authorization_version: number; password_changed_at: string | null; deletion_status: string | null } | undefined;
    const sessionHash = hashToken(token);
    const session = db.prepare('SELECT expires_at,revoked_at FROM active_sessions WHERE token_hash=? AND user_id=?').get(sessionHash, jwt.userId) as
      { expires_at: string; revoked_at: string | null } | undefined;
    if (!user || user.authorization_version !== (jwt.authorizationVersion ?? 0) || !session || session.revoked_at
      || epoch(session.expires_at) <= now || !jwt.iat || !jwt.exp || jwt.exp * 1000 <= now
      || (user.password_changed_at && epoch(user.password_changed_at) > jwt.iat * 1000)) {
      throw new WebPushError(401, 'UNAUTHORIZED', 'Sign in again before enabling notifications.');
    }
    if (user.deletion_status === 'pending_deletion' || user.deletion_status === 'finalized') throw new WebPushError(403, 'FORBIDDEN', 'Push is unavailable for this account.');
    const expiresAt = Math.min(epoch(session.expires_at), jwt.exp * 1000);
    const existing = db.prepare('SELECT id,user_id,p256dh,auth FROM web_push_subscriptions WHERE endpoint=?').get(sub.endpoint) as
      { id: string; user_id: string; p256dh: string; auth: string } | undefined;
    // A browser endpoint changing hands (another sign-in on the same phone) or rotating keys drops queued pushes for the old binding.
    if (existing && (existing.user_id !== jwt.userId || existing.p256dh !== sub.p256dh || existing.auth !== sub.auth)) {
      db.prepare("UPDATE web_push_outbox SET state='cancelled',claim_id=NULL,lease_until=0,last_error='subscription_changed' WHERE subscription_id=? AND state IN ('pending','sending')").run(existing.id);
    }
    const id = existing?.id ?? randomUUID();
    db.prepare(`INSERT INTO web_push_subscriptions (id,user_id,session_hash,authorization_version,token_issued_at,endpoint,p256dh,auth,lease_expires_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,session_hash=excluded.session_hash,
      authorization_version=excluded.authorization_version,token_issued_at=excluded.token_issued_at,p256dh=excluded.p256dh,auth=excluded.auth,
      lease_expires_at=excluded.lease_expires_at,updated_at=excluded.updated_at`)
      .run(id, jwt.userId, sessionHash, user.authorization_version, jwt.iat, sub.endpoint, sub.p256dh, sub.auth, expiresAt, now, now);
    return { enabled: true, expiresAt };
  }).immediate();
}

/** Removes this browser's subscription for the signed-in user. Unknown endpoints succeed silently. */
export function removeSubscription(raw: unknown, userId: string) {
  const endpoint = (raw as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 1024) throw new WebPushError(400, 'VALIDATION_ERROR', 'Invalid push endpoint.');
  db.prepare('DELETE FROM web_push_subscriptions WHERE endpoint=? AND user_id=?').run(endpoint, userId);
  return { enabled: false };
}

export interface WebPushRequest { endpoint: string; headers: Record<string, string>; body: Buffer }
export interface WebPushTransport { send(request: WebPushRequest): Promise<{ status: number }> }
export const fetchTransport: WebPushTransport = {
  async send(request) {
    const res = await fetch(request.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: request.headers, body: request.body });
    await res.body?.cancel().catch(() => {});
    return { status: res.status };
  },
};

type Delivery = { id: string; notification_id: string; subscription_id: string; attempts: number; expires_at: number; claim_id: string };
type Target = { endpoint: string; p256dh: string; auth: string };
function destination(row: Delivery, now: number): Target | undefined {
  return db.prepare(`SELECT s.endpoint,s.p256dh,s.auth FROM web_push_subscriptions s
    JOIN users u ON u.id=s.user_id JOIN active_sessions a ON a.token_hash=s.session_hash AND a.user_id=u.id
    JOIN notifications n ON n.id=? AND n.user_id=u.id
    WHERE s.id=? AND s.lease_expires_at>? AND u.authorization_version=s.authorization_version
      AND (u.deletion_status IS NULL OR u.deletion_status='legal_hold')
      AND (u.password_changed_at IS NULL OR unixepoch(u.password_changed_at)<=s.token_issued_at)
      AND a.revoked_at IS NULL AND unixepoch(a.expires_at)*1000>?
      AND n.read=0 AND NOT EXISTS (SELECT 1 FROM notification_preferences p WHERE p.user_id=u.id AND p.type=n.type AND p.enabled=0)`)
    .get(row.notification_id, row.subscription_id, now, now) as Target | undefined;
}
function claim(now: number): Delivery | undefined {
  return db.transaction(() => {
    const row = db.prepare(`SELECT * FROM web_push_outbox WHERE state IN ('pending','sending') AND next_attempt_at<=? AND lease_until<=?
      ORDER BY next_attempt_at,id LIMIT 1`).get(now, now) as Delivery | undefined;
    if (!row) return;
    const claimId = randomUUID();
    db.prepare("UPDATE web_push_outbox SET claim_id=?,lease_until=?,state='sending',attempts=attempts+1 WHERE id=?").run(claimId, now + 60_000, row.id);
    return { ...row, attempts: row.attempts + 1, claim_id: claimId };
  }).immediate();
}
function finish(row: Delivery, state: string, code: string | null, next: number) {
  return db.prepare('UPDATE web_push_outbox SET state=?,last_error=?,next_attempt_at=?,lease_until=0,claim_id=NULL WHERE id=? AND claim_id=?')
    .run(state, code, next, row.id, row.claim_id).changes === 1;
}
function retry(row: Delivery, code: string, now: number, retryable = true) {
  const next = now + Math.min(15 * 60_000, 30_000 * 2 ** Math.min(row.attempts, 5));
  finish(row, !retryable || row.attempts >= 5 || next >= row.expires_at ? 'failed' : 'pending', code, next);
}

export const webPushMessage = { title: 'LMS update', body: 'You have a new LMS notification. Open the app to view it.' };

/** Leased per-delivery work survives restarts. A push service that accepted a message cannot recall it. */
export async function processWebPushOutbox(options: { transport?: WebPushTransport; now?: () => number; limit?: number; shouldContinue?: () => boolean } = {}) {
  let processed = 0;
  const config = webPushConfiguration();
  if (!config.enabled || isWriterHoldActive()) return { processed };
  const clock = options.now ?? Date.now; const transport = options.transport ?? fetchTransport;
  for (let index = 0; index < Math.min(50, options.limit ?? 20); index++) {
    if (isWriterHoldActive() || options.shouldContinue?.() === false) break;
    const now = clock(); const row = claim(now); if (!row) break;
    const target = destination(row, now);
    if (!target || row.expires_at <= now || !isAllowedEndpoint(target.endpoint)) {
      finish(row, 'cancelled', row.expires_at <= now ? 'DeliveryExpired' : 'binding_inactive', now); continue;
    }
    const ttl = Math.max(1, Math.floor((row.expires_at - now) / 1000));
    const payload = Buffer.from(JSON.stringify({ ...webPushMessage, notificationId: row.notification_id, url: '/' }));
    try {
      const { status } = await transport.send({ endpoint: target.endpoint, body: encryptPayload(payload, target.p256dh, target.auth), headers: {
        Authorization: vapidAuthorization(target.endpoint, config, now), 'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'normal',
      } });
      if (isWriterHoldActive()) break;
      const completed = clock();
      if (status >= 200 && status < 300) finish(row, 'delivered', null, completed);
      else if (status === 404 || status === 410) {
        // The browser dropped this subscription (permission removed or app deleted from the home screen).
        db.transaction(() => {
          if (finish(row, 'failed', 'SubscriptionGone', completed)) db.prepare('DELETE FROM web_push_subscriptions WHERE id=?').run(row.subscription_id);
        }).immediate();
      } else retry(row, `HTTP_${status}`, completed, status === 429 || status >= 500);
      processed++;
    } catch {
      if (isWriterHoldActive()) break;
      retry(row, 'ProviderUnavailable', clock());
    }
  }
  return { processed };
}

let interval: ReturnType<typeof setInterval> | undefined;
let working: Promise<unknown> | undefined;
let stopping = false;
export function startWebPushWorker() {
  if (interval || !webPushConfiguration().enabled) return;
  stopping = false;
  interval = setInterval(() => {
    if (working || stopping) return;
    working = processWebPushOutbox({ shouldContinue: () => !stopping })
      .catch(() => logger.error({ module: 'web-push-worker' }, 'Web push outbox tick failed'))
      .finally(() => { working = undefined; });
  }, 5_000);
}
export async function stopWebPushWorker() {
  stopping = true; if (interval) clearInterval(interval); interval = undefined;
  await working;
}
