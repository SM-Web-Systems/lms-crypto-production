/** Admin minter status: address and XLM balance, read-only, secret never returned. */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import * as StellarSdk from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import './setup.js';
import app from '../app.js';
import { execute } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { getMinterStatus } from '../services/minterStatusService.js';

const kp = StellarSdk.Keypair.random();
const ENV = ['NFT_STELLAR_NETWORK', 'NFT_MINTER_SECRET', 'NFT_CONTRACT_ID'] as const;
const saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
function configure() {
  process.env.NFT_STELLAR_NETWORK = 'public';
  process.env.NFT_MINTER_SECRET = kp.secret();
  process.env.NFT_CONTRACT_ID = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';
}
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const okFetch = (balance: string) => (async (url: string) => {
  expect(url).toBe(`https://horizon.stellar.org/accounts/${kp.publicKey()}`);
  return new Response(JSON.stringify({ balances: [{ asset_type: 'credit_alphanum4', balance: '9' }, { asset_type: 'native', balance }] }), { status: 200 });
}) as unknown as typeof fetch;

describe('getMinterStatus', () => {
  it('reports the address and balance, never the secret', async () => {
    configure();
    const s = await getMinterStatus(okFetch('7.4348539'));
    expect(s).toMatchObject({ configured: true, network: 'public', minterAddress: kp.publicKey(), balanceXlm: '7.4348539', low: false, error: null });
    expect(JSON.stringify(s)).not.toContain(kp.secret());
  });

  it('flags a low balance', async () => {
    configure();
    expect((await getMinterStatus(okFetch('1.2'))).low).toBe(true);
  });

  it('reports an unfunded account and an unreachable network', async () => {
    configure();
    const missing = await getMinterStatus((async () => new Response('{}', { status: 404 })) as unknown as typeof fetch);
    expect(missing).toMatchObject({ balanceXlm: '0', low: true });
    const down = await getMinterStatus((async () => { throw new Error('down'); }) as unknown as typeof fetch);
    expect(down).toMatchObject({ configured: true, balanceXlm: null });
    expect(down.error).toMatch(/could not be reached/);
  });

  it('says when minting is not configured', async () => {
    delete process.env.NFT_MINTER_SECRET;
    process.env.NFT_STELLAR_NETWORK = 'public';
    expect(await getMinterStatus()).toMatchObject({ configured: false, minterAddress: null });
  });
});

describe('GET /api/v1/admin/minter-status', () => {
  it('is refused without certificate.mint', async () => {
    const userId = uuidv4();
    const email = `learner-${userId.slice(0, 8)}@test.com`;
    execute("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Learner', ?, '$2a$10$test', 'student')", [userId, email]);
    execute("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'role_student')", [userId]);
    const token = generateToken({ userId, email, role: 'student' as never });
    expect((await request(app).get('/api/v1/admin/minter-status').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });
});
