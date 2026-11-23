/**
 * NFT TTL keeper (23 Nov 2026): the certificate contract never extends its own instance/wasm TTL, so the
 * LMS keeps it 1–2 months ahead. Extend only live entries under the threshold, never restore, dry run by
 * default, and refuse fees above the cap.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import { runTtlKeeper, keeperSettings, dueEntries, dataKey, instanceKey, LEDGERS_PER_DAY } from '../services/nftTtlKeeper.js';

const { xdr } = StellarSdk;
const minter = StellarSdk.Keypair.random();
const owner = StellarSdk.Keypair.random().publicKey();
const CONTRACT = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';
const LATEST = 1_000_000;
const WASM = Buffer.alloc(32, 7);

function instanceVal() {
  const instance = new xdr.ScContractInstance({
    executable: xdr.ContractExecutable.contractExecutableWasm(WASM),
    storage: [new xdr.ScMapEntry({ key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('TokenIdCounter')]), val: xdr.ScVal.scvU32(2) })],
  });
  return contractData(xdr.ScVal.scvLedgerKeyContractInstance(), xdr.ScVal.scvContractInstance(instance));
}
function contractData(key: StellarSdk.xdr.ScVal, val: StellarSdk.xdr.ScVal) {
  return xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({
    ext: new xdr.ExtensionPoint(0), contract: new StellarSdk.Address(CONTRACT).toScAddress(), key,
    durability: xdr.ContractDataDurability.persistent(), val,
  }));
}

/** liveUntil per key label; anything unnamed is live 100 days ahead. Token 0 is archived (missing). */
function fakeServer(opts: { fee?: number; daysLeft?: number } = {}) {
  const daysLeft = opts.daysLeft ?? 20;
  const ownerKey = (id: number) => dataKey(CONTRACT, xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Owner'), xdr.ScVal.scvU32(id)])).toXDR('base64');
  const sent: StellarSdk.Transaction[] = [];
  const server = {
    getLatestLedger: vi.fn(async () => ({ sequence: LATEST })),
    getLedgerEntries: vi.fn(async (...keys: StellarSdk.xdr.LedgerKey[]) => ({
      latestLedger: LATEST,
      entries: keys.flatMap((key) => {
        const b = key.toXDR('base64');
        if (b === ownerKey(0)) return []; // archived
        let val: StellarSdk.xdr.LedgerEntryData = contractData(xdr.ScVal.scvVoid(), xdr.ScVal.scvVoid());
        let liveUntil = LATEST + 100 * LEDGERS_PER_DAY;
        if (b === instanceKey(CONTRACT).toXDR('base64')) { val = instanceVal(); liveUntil = LATEST + daysLeft * LEDGERS_PER_DAY; }
        if (key.switch().name === 'contractCode') liveUntil = LATEST + daysLeft * LEDGERS_PER_DAY;
        if (b === ownerKey(1)) { val = contractData(xdr.ScVal.scvVoid(), new StellarSdk.Address(owner).toScVal()); liveUntil = LATEST + 10 * LEDGERS_PER_DAY; }
        return [{ key, val, liveUntilLedgerSeq: liveUntil, lastModifiedLedgerSeq: 1 }];
      }),
    })),
    getAccount: vi.fn(async () => new StellarSdk.Account(minter.publicKey(), '100')),
    simulateTransaction: vi.fn(async () => ({
      id: '1', latestLedger: LATEST, events: [], _parsed: true, minResourceFee: String(opts.fee ?? 6_000_000),
      transactionData: new StellarSdk.SorobanDataBuilder().setResourceFee(opts.fee ?? 6_000_000),
    } as unknown as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse)),
    sendTransaction: vi.fn(async (tx: StellarSdk.Transaction) => { sent.push(tx); return { status: 'PENDING', hash: 'abc', latestLedger: LATEST, latestLedgerCloseTime: 0 }; }),
    getTransaction: vi.fn(async () => ({ status: 'SUCCESS' })),
  };
  return { server: server as never, raw: server, sent };
}

beforeEach(() => {
  process.env.NFT_STELLAR_NETWORK = 'public';
  process.env.NFT_MINTER_SECRET = minter.secret();
  process.env.NFT_CONTRACT_ID = CONTRACT;
  process.env.NFT_TTL_KEEPER_ENABLED = 'true';
});
afterEach(() => {
  for (const k of ['NFT_STELLAR_NETWORK', 'NFT_MINTER_SECRET', 'NFT_CONTRACT_ID', 'NFT_TTL_KEEPER_ENABLED', 'NFT_TTL_KEEPER_SEND', 'NFT_TTL_MAX_FEE_STROOPS', 'NFT_TTL_THRESHOLD_DAYS', 'NFT_TTL_TARGET_DAYS']) delete process.env[k];
  vi.restoreAllMocks();
});

describe('NFT TTL keeper', () => {
  it('is off unless enabled', async () => {
    delete process.env.NFT_TTL_KEEPER_ENABLED;
    const { server, raw } = fakeServer();
    expect((await runTtlKeeper({ server })).skipped).toBe('disabled');
    expect(raw.getLedgerEntries).not.toHaveBeenCalled();
  });

  it('defaults to 30 days threshold, 60 days target, 10 XLM cap, dry run', () => {
    const s = keeperSettings();
    expect(s).toMatchObject({ send: false, thresholdLedgers: 30 * LEDGERS_PER_DAY, targetLedgers: 60 * LEDGERS_PER_DAY, maxFeeStroops: 100_000_000n });
  });

  it('dry run: picks instance, wasm and short-lived token entries, reports archived ones, sends nothing', async () => {
    const { server, raw } = fakeServer();
    const r = await runTtlKeeper({ server });
    expect(r.archived).toContain('Owner(0)');
    // instance + wasm (20 days left) + Owner(1) (10 days left); everything else has 100 days
    expect(r.due).toBe(3);
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0]).toMatchObject({ entries: 3, sent: false });
    expect(raw.sendTransaction).not.toHaveBeenCalled();
    // Balance/OwnerTokens of the owner found in Owner(1) are tracked too
    const labels = raw.getLedgerEntries.mock.calls.flat().length;
    expect(labels).toBeGreaterThan(10);
  });

  it('extends to the target from now and sends only when NFT_TTL_KEEPER_SEND=true', async () => {
    process.env.NFT_TTL_KEEPER_SEND = 'true';
    const { server, sent } = fakeServer();
    const r = await runTtlKeeper({ server });
    expect(r.batches[0].sent).toBe(true);
    const op = sent[0].operations[0] as StellarSdk.Operation.ExtendFootprintTTL;
    expect(op.type).toBe('extendFootprintTtl');
    expect(op.extendTo).toBe(60 * LEDGERS_PER_DAY);
    expect(sent[0].signatures).toHaveLength(1);
  });

  it('refuses a fee above the cap', async () => {
    process.env.NFT_TTL_KEEPER_SEND = 'true';
    const { server, raw } = fakeServer({ fee: 216_098_200 });
    const r = await runTtlKeeper({ server });
    expect(r.batches[0].error).toMatch(/above the 10 XLM cap\. Nothing was sent/);
    expect(raw.sendTransaction).not.toHaveBeenCalled();
  });

  it('does nothing when every entry is further ahead than the threshold', async () => {
    process.env.NFT_TTL_THRESHOLD_DAYS = '5';
    process.env.NFT_TTL_TARGET_DAYS = '35';
    const { server, raw } = fakeServer();
    const r = await runTtlKeeper({ server });
    expect(r.due).toBe(0);
    expect(raw.simulateTransaction).not.toHaveBeenCalled();
  });

  it('dueEntries never includes archived entries', () => {
    const k = instanceKey(CONTRACT);
    const { archived, due } = dueEntries([
      { label: 'a', key: k, liveUntil: undefined },
      { label: 'b', key: k, liveUntil: LATEST - 1 },
      { label: 'c', key: k, liveUntil: LATEST + 5 },
    ], LATEST, 100);
    expect(archived.map((e) => e.label)).toEqual(['a', 'b']);
    expect(due.map((e) => e.label)).toEqual(['c']);
  });
});
