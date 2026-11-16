import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

let saved: string | undefined;
beforeEach(() => { saved = process.env.AMMA_WALLET_URL; process.env.AMMA_WALLET_URL = 'https://wallet.example/'; });
afterEach(() => { if (saved === undefined) delete process.env.AMMA_WALLET_URL; else process.env.AMMA_WALLET_URL = saved; vi.unstubAllGlobals(); });

function learner(linked = true) {
  const id = uuidv4(), address = Keypair.random().publicKey();
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, 'x', 'student', ?, ?)`)
    .run(id, 'Nft learner', `nft-${id}@test.invalid`, linked ? address : null, linked ? 'linked' : 'none');
  return { id, address, token: makeToken({ userId: id, email: `nft-${id}@test.invalid`, role: 'student' }) };
}
const get = (token: string) => request(app).get('/api/v1/wallet/nfts').set('Authorization', `Bearer ${token}`);

describe('GET /wallet/nfts: the LMS fetches the learner\'s own badges from AmmaWallet', () => {
  it('asks the wallet for the signed-in learner\'s own address, never one from the client', async () => {
    const l = learner();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ indexed: { tokens: [] } }) });
    vi.stubGlobal('fetch', fetchMock);
    const res = await get(l.token).query({ address: 'GSOMEONEELSE' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { indexed: { tokens: [] } }, unavailable: false });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://wallet.example/api/v1/nfts/owner/${l.address}`);
  });

  it('answers 200 with unavailable when the wallet is down, slow or refuses', async () => {
    const l = learner();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect((await get(l.token)).body).toMatchObject({ success: true, data: null, unavailable: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect((await get(l.token)).body).toMatchObject({ data: null, unavailable: true });
    delete process.env.AMMA_WALLET_URL;
    expect((await get(l.token)).body).toMatchObject({ data: null, unavailable: true });
  });

  it('does not call the wallet for a learner with no linked wallet, and needs a sign-in', async () => {
    const l = learner(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await get(l.token)).body).toMatchObject({ data: null, unavailable: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await request(app).get('/api/v1/wallet/nfts')).status).toBe(401);
  });
});
