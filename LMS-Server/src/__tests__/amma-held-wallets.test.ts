import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);
function user(roles: string[], wallet: string | null = null) {
  const id = uuidv4(), email = `aw-${id}@test.invalid`;
  db.prepare("INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, ?, 'student', ?, ?)")
    .run(id, `User ${id.slice(0, 4)}`, email, HASH, wallet, wallet ? 'linked' : 'none');
  for (const r of roles) db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, r);
  return { id, email, token: () => makeToken({ userId: id, email, role: 'student' }) };
}
const auth = (u: { token: () => string }) => ({ Authorization: `Bearer ${u.token()}` });
const address = () => Keypair.random().publicKey();
let n = 0;
const nextAmmaId = () => 900000 + (++n) + Math.floor(Math.random() * 1000) * 1000;
function course() {
  const id = uuidv4();
  db.prepare('INSERT INTO courses (id, title, course_code, sections) VALUES (?, ?, ?, ?)').run(id, 'Wallet course', `AW-${id.slice(0, 8)}`, '[]');
  return id;
}
function approvedApplication(userId: string, courseId: string, wallet: string) {
  const id = uuidv4();
  db.prepare("INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, reviewed_at) VALUES (?, ?, ?, ?, 'approved', 'paid', datetime('now'))")
    .run(id, userId, courseId, wallet);
  return id;
}
const importWallets = (actor: { token: () => string }, wallets: unknown[]) =>
  request(app).post('/api/v1/admin/amma-wallets/import').set(auth(actor)).send({ wallets });

describe('Amma-held wallets', () => {
  it('the super admin stores the Amma-held address; later mints and the application use it', async () => {
    const sa = user(['role_super_admin']);
    const keyless = address(), held = address();
    const l = user(['role_student'], keyless);
    const c = course(); const appId = approvedApplication(l.id, c, keyless);
    const ammaUserId = nextAmmaId();
    const r = await importWallets(sa, [{ lmsUserId: l.id, ammaUserId, address: held }]);
    expect(r.status).toBe(200);
    expect(r.body.data.results[0]).toMatchObject({ result: 'stored', previousAddress: keyless });
    expect(db.prepare('SELECT walletAddress, wallet_linking_status FROM users WHERE id = ?').get(l.id)).toEqual({ walletAddress: held, wallet_linking_status: 'linked' });
    expect(db.prepare('SELECT wallet_address FROM course_nft_applications WHERE id = ?').get(appId)).toEqual({ wallet_address: held });
    expect((await importWallets(sa, [{ lmsUserId: l.id, ammaUserId, address: held }])).body.data.results[0].result).toBe('unchanged');
    const status = await request(app).get(`/api/v1/admin/amma-wallets/status?userIds=${l.id}`).set(auth(sa));
    expect(status.body.data.users[0]).toMatchObject({ walletAddress: held, ammaHeld: true, ammaUserId, activation: null });
  });

  it('refuses bad rows without stopping the others', async () => {
    const sa = user(['role_super_admin']);
    const a = user(['role_student']), b = user(['role_student']), taken = address();
    user(['role_student'], taken);
    const r = await importWallets(sa, [
      { lmsUserId: a.id, ammaUserId: nextAmmaId(), address: 'GNOTANADDRESS' },
      { lmsUserId: a.id, ammaUserId: -1, address: address() },
      { lmsUserId: 'no-such-user', ammaUserId: nextAmmaId(), address: address() },
      { lmsUserId: a.id, ammaUserId: nextAmmaId(), address: taken },
      { lmsUserId: b.id, ammaUserId: nextAmmaId(), address: address() },
    ]);
    expect(r.body.data.results.map((x: { result: string }) => x.result)).toEqual(['refused', 'refused', 'refused', 'refused', 'stored']);
    expect(db.prepare('SELECT walletAddress FROM users WHERE id = ?').get(a.id)).toEqual({ walletAddress: null });
  });

  it('only the super admin can import, read status or queue activations', async () => {
    const ea = user(['role_admin2']), admin = user(['role_admin']), l = user(['role_student']);
    for (const actor of [ea, admin, l]) {
      expect((await importWallets(actor, [{ lmsUserId: l.id, ammaUserId: nextAmmaId(), address: address() }])).status).toBe(403);
      expect((await request(app).get(`/api/v1/admin/amma-wallets/status?userIds=${l.id}`).set(auth(actor))).status).toBe(403);
      expect((await request(app).post('/api/v1/admin/amma-activations').set(auth(actor)).send({ courseId: 'x', userIds: [l.id] })).status).toBe(403);
    }
  });

  it('queues one activation per approved certificate, once, and only for Amma-held wallets', async () => {
    const sa = user(['role_super_admin']);
    const c = course();
    const ready = user(['role_student']), noWallet = user(['role_student'], address()), notApproved = user(['role_student']);
    const ammaUserId = nextAmmaId();
    await importWallets(sa, [{ lmsUserId: ready.id, ammaUserId, address: address() }, { lmsUserId: notApproved.id, ammaUserId: nextAmmaId(), address: address() }]);
    const appId = approvedApplication(ready.id, c, 'x');
    approvedApplication(noWallet.id, c, 'x');
    const send = () => request(app).post('/api/v1/admin/amma-activations').set(auth(sa)).send({ courseId: c, userIds: [ready.id, noWallet.id, notApproved.id] });
    const first = await send();
    expect(first.status).toBe(200);
    expect(first.body.data.results.map((x: { result: string }) => x.result)).toEqual(['queued', 'refused', 'refused']);
    expect((await send()).body.data.results[0].result).toBe('already_queued');
    const row = db.prepare('SELECT amma_user_id, completion_id, idempotency_key, task_key, status FROM amma_activations WHERE user_id = ?').get(ready.id);
    expect(row).toEqual({ amma_user_id: ammaUserId, completion_id: appId, idempotency_key: `lms-activate-${appId}`, task_key: 'lms:course-complete', status: 'queued' });
  });
});

describe('changing a password while signed in', () => {
  it('needs the current password, sets the new one and ends the session', async () => {
    const id = uuidv4(), email = `cp-${id}@test.invalid`;
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Pat', ?, ?, 'student')").run(id, email, HASH);
    const signIn = (password: string) => request(app).post('/api/v1/auth/login').send({ email, password });
    const token = (await signIn('password123')).body.data.token;
    const change = (body: object) => request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${token}`).send(body);
    expect((await change({ currentPassword: 'wrong-one', newPassword: 'N3w-Password!x' })).status).toBe(401);
    expect((await change({ currentPassword: 'password123', newPassword: 'short' })).status).toBe(400);
    expect((await change({ currentPassword: 'password123', newPassword: 'N3w-Password!x' })).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await signIn('password123')).status).toBe(401);
    expect((await signIn('N3w-Password!x')).status).toBe(200);
  });

  it('is refused without signing in', async () => {
    expect((await request(app).post('/api/v1/auth/change-password').send({ currentPassword: 'a', newPassword: 'bbbbbbbbbb' })).status).toBe(401);
  });
});
