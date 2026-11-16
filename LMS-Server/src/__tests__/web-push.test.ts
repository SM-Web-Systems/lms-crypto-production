import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID, createECDH, createDecipheriv, hkdfSync, generateKeyPairSync, createPublicKey, verify, randomBytes } from 'node:crypto';
import { db, hashToken } from '../config/database.js';
import app from '../app.js';
import { createNotification, updatePreferences } from '../services/notificationService.js';
import { encryptPayload, processWebPushOutbox, saveSubscription, vapidAuthorization, webPushConfiguration, isAllowedEndpoint,
  type WebPushRequest } from '../services/webPushService.js';

afterEach(() => { vi.unstubAllEnvs(); });
const b = (s: string) => Buffer.from(s, 'base64url');

function vapidEnv() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' }) as { x: string; y: string; d: string };
  const pub = Buffer.concat([Buffer.from([4]), b(jwk.x), b(jwk.y)]).toString('base64url');
  vi.stubEnv('WEB_PUSH_ENABLED', 'true'); vi.stubEnv('WEB_PUSH_VAPID_PUBLIC_KEY', pub);
  vi.stubEnv('WEB_PUSH_VAPID_PRIVATE_KEY', jwk.d); vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:ops@test.invalid');
  return pub;
}
function account() {
  const id = randomUUID();
  db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES (?,'Synthetic',?,'hash','student')").run(id, `${id}@test.invalid`);
  const token = jwt.sign({ userId: id, role: 'student', authorizationVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: '2h', jwtid: randomUUID() });
  db.prepare('INSERT INTO active_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(randomUUID(), id, hashToken(token), new Date(Date.now() + 7_200_000).toISOString());
  return { id, token };
}
/** A synthetic browser: its own P-256 key and auth secret, so tests can decrypt exactly like a real user agent. */
function browser(host = 'web.push.apple.com') {
  const ua = createECDH('prime256v1'); ua.generateKeys(); const auth = randomBytes(16);
  return { ua, auth, subscription: { endpoint: `https://${host}/${randomUUID()}`, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}
/** Receiver side of RFC 8291, written independently of the sender. */
function decrypt(body: Buffer, ua: ReturnType<typeof createECDH>, auth: Buffer) {
  const salt = body.subarray(0, 16); const rs = body.readUInt32BE(16); const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen); const ciphertext = body.subarray(21 + idlen);
  expect(rs).toBe(4096);
  const shared = ua.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ciphertext.subarray(-16));
  const padded = Buffer.concat([d.update(ciphertext.subarray(0, -16)), d.final()]);
  expect(padded[padded.length - 1]).toBe(2);
  return padded.subarray(0, -1).toString('utf8');
}

describe('Web Push encryption and VAPID', () => {
  it('matches the RFC 8291 Appendix A test vector', () => {
    const as = createECDH('prime256v1'); as.setPrivateKey(b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'));
    const out = encryptPayload(Buffer.from('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', as, b('DGv6ra1nlYgDCS1FRnbzlw'));
    expect(out.toString('base64url')).toBe('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  });
  it('signs a VAPID JWT for the push service origin that verifies with the public key', () => {
    const pub = vapidEnv(); const config = webPushConfiguration(); expect(config.enabled).toBe(true);
    const header = vapidAuthorization('https://web.push.apple.com/abc', config, 1_700_000_000_000);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(pub);
    const [h, c, s] = token.split('.');
    expect(JSON.parse(b(c).toString())).toEqual({ aud: 'https://web.push.apple.com', exp: 1_700_000_000 + 43_200, sub: 'mailto:ops@test.invalid' });
    const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b(pub).subarray(1, 33).toString('base64url'), y: b(pub).subarray(33).toString('base64url') } });
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, b(s))).toBe(true);
  });
  it('stays off without a complete, matching key pair and contact', () => {
    vapidEnv(); vi.stubEnv('WEB_PUSH_ENABLED', 'false'); expect(webPushConfiguration().enabled).toBe(false);
    vapidEnv(); vi.stubEnv('WEB_PUSH_SUBJECT', ''); expect(webPushConfiguration().enabled).toBe(false);
    vapidEnv(); vi.stubEnv('WEB_PUSH_VAPID_PRIVATE_KEY', randomBytes(32).toString('base64url')); expect(webPushConfiguration().enabled).toBe(false);
  });
  it('only accepts known push service endpoints', () => {
    expect(isAllowedEndpoint('https://web.push.apple.com/QK')).toBe(true);
    expect(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isAllowedEndpoint('http://web.push.apple.com/QK')).toBe(false);
    expect(isAllowedEndpoint('https://web.push.apple.com:8443/QK')).toBe(false);
    expect(isAllowedEndpoint('https://evil.invalid/web.push.apple.com')).toBe(false);
    expect(isAllowedEndpoint('https://169.254.169.254/latest')).toBe(false);
  });
});

describe('Web Push subscriptions and delivery', () => {
  const base = '/api/v1/notifications/push/web';
  function capture(status = 201) {
    const sent: WebPushRequest[] = [];
    return { sent, transport: { send: vi.fn(async (r: WebPushRequest) => { sent.push(r); return { status }; }) } };
  }
  const outbox = () => db.prepare('SELECT state,last_error FROM web_push_outbox ORDER BY rowid').all() as { state: string; last_error: string | null }[];

  it('reports config with only the public key and refuses subscriptions when off', async () => {
    const owner = account(); const auth = `Bearer ${owner.token}`;
    expect((await request(app).get(`${base}/config`).set('Authorization', auth)).body.data).toEqual({ enabled: false, publicKey: null });
    expect((await request(app).put(`${base}/subscription`).set('Authorization', auth).send(browser().subscription)).status).toBe(503);
    const pub = vapidEnv();
    const config = await request(app).get(`${base}/config`).set('Authorization', auth);
    expect(config.body.data).toEqual({ enabled: true, publicKey: pub });
    expect(JSON.stringify(config.body)).not.toContain(process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
    expect((await request(app).get(`${base}/config`)).status).toBe(401);
  });

  it('binds a subscription to the signed-in session and delivers an encrypted generic payload', async () => {
    vapidEnv(); const owner = account(); const other = account(); const phone = browser();
    expect((await request(app).put(`${base}/subscription`).send(phone.subscription)).status).toBe(401);
    const saved = await request(app).put(`${base}/subscription`).set('Authorization', `Bearer ${owner.token}`).send({ ...phone.subscription, userId: other.id });
    expect(saved.status).toBe(200);
    expect(db.prepare('SELECT user_id FROM web_push_subscriptions WHERE endpoint=?').get(phone.subscription.endpoint)).toEqual({ user_id: owner.id });
    createNotification({ userId: owner.id, type: 'course_enrolled', title: 'PRIVATE course title', body: 'PRIVATE learner details' });
    createNotification({ userId: other.id, type: 'course_enrolled', title: 'Not for the owner', body: 'x' });
    const { sent, transport } = capture();
    expect(await processWebPushOutbox({ transport })).toEqual({ processed: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe(phone.subscription.endpoint);
    expect(sent[0].headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', Urgency: 'normal' });
    expect(sent[0].headers.Authorization).toMatch(/^vapid t=/);
    const message = JSON.parse(decrypt(sent[0].body, phone.ua, phone.auth));
    expect(message).toMatchObject({ title: 'LMS update', url: '/' });
    expect(JSON.stringify(message)).not.toContain('PRIVATE');
    expect(outbox().map(r => r.state)).toEqual(['delivered']);
  });

  it('stops delivery after logout, honours preferences and skips already-read notifications', async () => {
    vapidEnv(); const owner = account(); const phone = browser(); const auth = `Bearer ${owner.token}`;
    saveSubscription(phone.subscription, owner.token);
    updatePreferences(owner.id, [{ type: 'course_enrolled', enabled: false }]);
    createNotification({ userId: owner.id, type: 'course_enrolled', title: 't', body: 'b', force: true });
    expect(outbox()).toHaveLength(0);
    createNotification({ userId: owner.id, type: 'nft_minted', title: 't', body: 'b' });
    db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(owner.id);
    const { transport } = capture();
    await processWebPushOutbox({ transport });
    expect(outbox().map(r => r.last_error)).toEqual(['binding_inactive']);
    createNotification({ userId: owner.id, type: 'nft_minted', title: 't', body: 'b' });
    expect((await request(app).post('/api/v1/auth/logout').set('Authorization', auth)).status).toBe(200);
    await processWebPushOutbox({ transport });
    expect(transport.send).not.toHaveBeenCalled();
    expect(outbox().map(r => r.state)).toEqual(['cancelled', 'cancelled']);
  });

  it('removes gone subscriptions, retries server errors and lets the owner unsubscribe', async () => {
    vapidEnv(); const owner = account(); const auth = `Bearer ${owner.token}`;
    const gone = browser(); saveSubscription(gone.subscription, owner.token);
    createNotification({ userId: owner.id, type: 'nft_minted', title: 't', body: 'b' });
    await processWebPushOutbox({ transport: capture(410).transport });
    expect(db.prepare('SELECT COUNT(*) n FROM web_push_subscriptions WHERE user_id=?').get(owner.id)).toEqual({ n: 0 });
    const flaky = browser('fcm.googleapis.com'); saveSubscription(flaky.subscription, owner.token);
    createNotification({ userId: owner.id, type: 'nft_minted', title: 't', body: 'b' });
    await processWebPushOutbox({ transport: capture(503).transport });
    expect(db.prepare("SELECT state,last_error FROM web_push_outbox WHERE state='pending'").all()).toEqual([{ state: 'pending', last_error: 'HTTP_503' }]);
    expect((await request(app).post(`${base}/unsubscribe`).set('Authorization', auth).send({ endpoint: flaky.subscription.endpoint })).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) n FROM web_push_subscriptions WHERE user_id=?').get(owner.id)).toEqual({ n: 0 });
  });

  it('rejects foreign endpoints and malformed keys', async () => {
    vapidEnv(); const owner = account(); const auth = `Bearer ${owner.token}`; const phone = browser();
    for (const body of [
      { ...phone.subscription, endpoint: 'https://attacker.invalid/x' },
      { ...phone.subscription, keys: { ...phone.subscription.keys, p256dh: Buffer.alloc(65, 9).toString('base64url') } },
      { ...phone.subscription, keys: { ...phone.subscription.keys, auth: 'short' } },
    ]) expect((await request(app).put(`${base}/subscription`).set('Authorization', auth).send(body)).status).toBe(400);
  });

  it('queues a test notification only for the caller', async () => {
    vapidEnv(); const owner = account(); const other = account();
    saveSubscription(browser().subscription, owner.token); saveSubscription(browser().subscription, other.token);
    expect((await request(app).post(`${base}/test`).set('Authorization', `Bearer ${owner.token}`)).status).toBe(200);
    expect(db.prepare("SELECT user_id FROM notifications WHERE type='push_test'").all()).toEqual([{ user_id: owner.id }]);
    expect(outbox()).toHaveLength(1);
  });
});
