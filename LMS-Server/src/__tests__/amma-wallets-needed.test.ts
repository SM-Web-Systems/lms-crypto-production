import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../app.js';
import { db } from '../config/database.js';
import * as wallet from '../services/walletService.js';
import { makeToken } from './helpers/auth.js';

// Audit 2026-11 (wallet custody): learners whose wallet nobody can sign for are listed for AmmaWallet,
// and sign-up can stop making new keyless wallets.
const HASH = bcrypt.hashSync('password123', 4);
function user(roles: string[], wallet: string | null = null, provider: string | null = null) {
  const id = uuidv4(), email = `wn-${id}@test.invalid`;
  db.prepare("INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status, auth_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, `User ${id.slice(0, 4)}`, email, HASH, roles.includes('role_student') ? 'student' : 'lecturer', wallet, wallet ? 'linked' : 'none', provider);
  db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(id);
  for (const r of roles) db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, r);
  return { id, email, token: () => makeToken({ userId: id, email, role: 'student' }) };
}
const auth = (u: { token: () => string }) => ({ Authorization: `Bearer ${u.token()}` });
const address = () => Keypair.random().publicKey();

async function neededList(actor: { token: () => string }) {
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 200) {
    const r = await request(app).get(`/api/v1/admin/amma-wallets/needed?offset=${offset}`).set(auth(actor));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    all.push(...r.body.data.users);
    if (offset + 200 >= r.body.data.total) return all;
  }
}

beforeEach(() => {
  // Production migrations add the SSO columns; tests use the canonical schema fixture.
  const cols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(c => c.name);
  if (!cols.includes('auth_provider')) db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'");
  if (!cols.includes('ammawallet_user_id')) db.exec('ALTER TABLE users ADD COLUMN ammawallet_user_id TEXT');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('learners waiting for an Amma-held wallet', () => {
  it('lists keyless and wallet-less email sign-ups, and leaves out Amma-held and AmmaWallet sign-ins', async () => {
    const sa = user(['role_super_admin']);
    const keyless = user(['role_student'], address());
    const none = user(['role_student']);
    const sso = user(['role_student'], address(), 'ammawallet');
    const heldAddress = address();
    const held = user(['role_student'], heldAddress);
    db.prepare("INSERT INTO amma_wallet_links (user_id, amma_user_id, wallet_address, imported_by, imported_at) VALUES (?, ?, ?, ?, datetime('now'))")
      .run(held.id, 700000 + Math.floor(Math.random() * 100000), heldAddress, sa.id);
    const staff = user(['role_instructor'], address());

    const ids = new Map((await neededList(sa)).map(u => [u.lmsUserId as string, u]));
    expect(ids.get(keyless.id)).toMatchObject({ email: keyless.email, keylessAddress: true, mintedCertificates: 0, waitingApplications: 0 });
    expect(ids.get(none.id)).toMatchObject({ currentAddress: null, keylessAddress: false });
    for (const [name, u] of Object.entries({ sso, held, staff, sa })) expect([name, ids.has(u.id)]).toEqual([name, false]);
  });

  it('is for the super admin only', async () => {
    const admin = user(['role_admin']);
    expect((await request(app).get('/api/v1/admin/amma-wallets/needed').set(auth(admin))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/amma-wallets/needed')).status).toBe(401);
  });

  it('caps the page at 200 rows', async () => {
    const sa = user(['role_super_admin']);
    const r = await request(app).get('/api/v1/admin/amma-wallets/needed?limit=5000&offset=-3').set(auth(sa));
    expect(r.body.data).toMatchObject({ limit: 200, offset: 0 });
  });
});

describe('sign-up wallet switch (AMMA_REGISTER_WALLET)', () => {
  const register = (email: string) => request(app).post('/api/v1/auth/register').send({ name: 'Wallet Switch', email, password: 'SyntheticPassword123!' });

  it('off: sign-up makes no AmmaWallet account and the learner waits for an Amma-held wallet', async () => {
    vi.stubEnv('AMMA_REGISTER_WALLET', 'off');
    const spy = vi.spyOn(wallet, 'createUserWallet');
    const r = await register(`off-${uuidv4()}@test.invalid`);
    expect(r.status).toBe(201);
    expect(spy).not.toHaveBeenCalled();
    expect(r.body.data.user).toMatchObject({ walletAddress: null, walletLinkingStatus: 'none' });
  });

  it('default: sign-up still makes the receive-only wallet', async () => {
    const made = address();
    const spy = vi.spyOn(wallet, 'createUserWallet').mockResolvedValue(made);
    const r = await register(`on-${uuidv4()}@test.invalid`);
    expect(r.status).toBe(201);
    expect(spy).toHaveBeenCalledOnce();
    expect(r.body.data.user).toMatchObject({ walletAddress: made, walletLinkingStatus: 'linked' });
  });
});
