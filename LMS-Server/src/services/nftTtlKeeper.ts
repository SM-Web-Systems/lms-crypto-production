/**
 * nftTtlKeeper.ts — keeps the certificate NFT contract (and its certificates) from archiving.
 *
 * Why: the deployed OpenZeppelin NFT contract never extends its own instance or wasm TTL, and the
 * 30-day per-token extensions it does are below the network minimum (120 days), so they do nothing.
 * When the instance/wasm archive, the next mint pays the restore (~21.6 XLM on 20 Nov 2026) and the
 * mint fee cap refuses it. Anyone can send ExtendFootprintTTL (no contract auth), so the LMS can do
 * it from the minter account on a schedule, without a contract change.
 *
 * Policy (user, 23 Nov 2026): stay about one to two months ahead. Each check extends every live entry
 * that has fewer than NFT_TTL_THRESHOLD_DAYS (default 30) left, up to NFT_TTL_TARGET_DAYS (default 60)
 * from now. Entries already further ahead are untouched and cost nothing.
 *
 * Safety:
 *  - Off unless NFT_TTL_KEEPER_ENABLED=true.
 *  - Dry run (simulate and log the XLM cost only) unless NFT_TTL_KEEPER_SEND=true.
 *  - Refuses to sign a transaction whose fee is above NFT_TTL_MAX_FEE_STROOPS (default 10 XLM).
 *  - Never restores archived entries; it only reports them (a restore is a separate, approved step).
 *  - NFT_MINTER_SECRET is never logged.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';
import { getNftNetworkConfig, stroopsToXlmText, describeSendError } from './mintService.js';
import { isWriterHoldActive } from './writerHold.js';

const { xdr } = StellarSdk;

export const LEDGERS_PER_DAY = 17_280; // 5 s ledgers
const DEFAULT_THRESHOLD_DAYS = 30;
const DEFAULT_TARGET_DAYS = 60;
const DEFAULT_MAX_FEE_STROOPS = 100_000_000n; // 10 XLM per transaction
const DEFAULT_INTERVAL_HOURS = 24;
const MAX_KEYS_PER_TX = 40;
const NETWORK_MAX_EXTEND = 3_110_399; // network max entry TTL (3,110,400) minus one

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw && /^\d+$/.test(raw) && Number(raw) > 0) return Number(raw);
  return fallback;
}

export function keeperSettings() {
  const thresholdDays = intEnv('NFT_TTL_THRESHOLD_DAYS', DEFAULT_THRESHOLD_DAYS);
  let targetDays = intEnv('NFT_TTL_TARGET_DAYS', DEFAULT_TARGET_DAYS);
  if (targetDays <= thresholdDays) targetDays = thresholdDays + 30;
  const rawFee = process.env.NFT_TTL_MAX_FEE_STROOPS?.trim();
  const maxFeeStroops = rawFee && /^\d+$/.test(rawFee) && BigInt(rawFee) > 0n ? BigInt(rawFee) : DEFAULT_MAX_FEE_STROOPS;
  return {
    enabled: process.env.NFT_TTL_KEEPER_ENABLED === 'true',
    send: process.env.NFT_TTL_KEEPER_SEND === 'true',
    thresholdLedgers: thresholdDays * LEDGERS_PER_DAY,
    targetLedgers: Math.min(targetDays * LEDGERS_PER_DAY, NETWORK_MAX_EXTEND),
    maxFeeStroops,
    intervalMs: intEnv('NFT_TTL_CHECK_INTERVAL_HOURS', DEFAULT_INTERVAL_HOURS) * 3_600_000,
  };
}

// ── Ledger keys of the OpenZeppelin NFT storage layout used by the deployed contract ──
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const u32 = (n: number) => xdr.ScVal.scvU32(n);
const vec = (...items: StellarSdk.xdr.ScVal[]) => xdr.ScVal.scvVec(items);
const addr = (a: string) => new StellarSdk.Address(a).toScVal();
const struct = (fields: Record<string, StellarSdk.xdr.ScVal>) =>
  xdr.ScVal.scvMap(Object.keys(fields).sort().map((k) => new xdr.ScMapEntry({ key: sym(k), val: fields[k] })));

export function dataKey(contractId: string, key: StellarSdk.xdr.ScVal): StellarSdk.xdr.LedgerKey {
  return xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: new StellarSdk.Address(contractId).toScAddress(),
    key,
    durability: xdr.ContractDataDurability.persistent(),
  }));
}
export const instanceKey = (contractId: string) => dataKey(contractId, xdr.ScVal.scvLedgerKeyContractInstance());
export const codeKey = (wasmHash: Buffer) => xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: wasmHash }));
export const tokenKeys = (contractId: string, tokenId: number) => ['Owner', 'GlobalTokens', 'GlobalTokensIndex', 'OwnerTokensIndex']
  .map((n) => ({ label: `${n}(${tokenId})`, key: dataKey(contractId, vec(sym(n), u32(tokenId))) }));
export const ownerKeys = (contractId: string, owner: string, balance: number) => [
  { label: `Balance(${owner.slice(0, 6)})`, key: dataKey(contractId, vec(sym('Balance'), addr(owner))) },
  ...Array.from({ length: balance }, (_, i) => ({
    label: `OwnerTokens(${owner.slice(0, 6)},${i})`,
    key: dataKey(contractId, vec(sym('OwnerTokens'), struct({ index: u32(i), owner: addr(owner) }))),
  })),
];
export const minterRoleKey = (contractId: string, minter: string) =>
  dataKey(contractId, vec(sym('HasRole'), addr(minter), sym('minter')));

export interface TrackedEntry { label: string; key: StellarSdk.xdr.LedgerKey; liveUntil?: number }
export interface KeeperResult {
  latestLedger: number;
  tracked: number;
  due: number;
  archived: string[];
  batches: { entries: number; feeStroops: string; feeXlm: string; sent: boolean; hash?: string; error?: string }[];
  totalFeeXlm: string;
  skipped?: 'disabled' | 'writer_hold';
}

type Rpc = Pick<StellarSdk.rpc.Server, 'getLedgerEntries' | 'getLatestLedger' | 'getAccount' | 'simulateTransaction' | 'sendTransaction' | 'getTransaction'>;

async function readEntries(server: Rpc, items: { label: string; key: StellarSdk.xdr.LedgerKey }[]) {
  const out = new Map<string, StellarSdk.rpc.Api.LedgerEntryResult>();
  for (let i = 0; i < items.length; i += 200) {
    const res = await server.getLedgerEntries(...items.slice(i, i + 200).map((x) => x.key));
    for (const e of res.entries) out.set(e.key.toXDR('base64'), e);
  }
  return out;
}

/** Collects every persistent entry the contract and its certificates rely on, with their live-until ledger. */
export async function collectEntries(server: Rpc, contractId: string, minter: string): Promise<TrackedEntry[]> {
  const inst = instanceKey(contractId);
  const instRes = (await server.getLedgerEntries(inst)).entries[0];
  if (!instRes) throw new Error('Contract instance not found (archived or wrong NFT_CONTRACT_ID)');
  const instance = instRes.val.contractData().val().instance();
  const wasmHash = instance.executable().wasmHash();
  let counter = 0;
  for (const e of instance.storage() ?? []) {
    const k = e.key();
    if (k.switch().name !== 'scvVec') continue;
    const head = k.vec()?.[0];
    // Other instance keys can start with a non-symbol value; .sym() would throw on them.
    if (head?.switch().name === 'scvSymbol' && head.sym().toString() === 'TokenIdCounter' && e.val().switch().name === 'scvU32') {
      counter = e.val().u32();
    }
  }

  const items: { label: string; key: StellarSdk.xdr.LedgerKey }[] = [
    { label: 'instance', key: inst },
    { label: 'wasm', key: codeKey(wasmHash) },
    { label: 'HasRole(minter)', key: minterRoleKey(contractId, minter) },
  ];
  for (let id = 0; id < counter; id++) items.push(...tokenKeys(contractId, id));
  const first = await readEntries(server, items);

  // Owners come from Owner(id); their Balance and OwnerTokens entries follow.
  const owners = new Map<string, number>();
  for (let id = 0; id < counter; id++) {
    const e = first.get(dataKey(contractId, vec(sym('Owner'), u32(id))).toXDR('base64'));
    if (!e) continue;
    const owner = StellarSdk.Address.fromScVal(e.val.contractData().val()).toString();
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
  }
  const more = [...owners].flatMap(([o, n]) => ownerKeys(contractId, o, n));
  const second = await readEntries(server, more);

  return [...items, ...more].map((x) => {
    const e = first.get(x.key.toXDR('base64')) ?? second.get(x.key.toXDR('base64'));
    return { ...x, liveUntil: e?.liveUntilLedgerSeq };
  });
}

/** Entries that are live but have fewer than thresholdLedgers left. */
export function dueEntries(entries: TrackedEntry[], latest: number, thresholdLedgers: number) {
  const archived = entries.filter((e) => !e.liveUntil || e.liveUntil < latest);
  const due = entries.filter((e) => e.liveUntil && e.liveUntil >= latest && e.liveUntil - latest < thresholdLedgers);
  return { archived, due };
}

export async function runTtlKeeper(deps: { server?: Rpc } = {}): Promise<KeeperResult> {
  const s = keeperSettings();
  const empty: KeeperResult = { latestLedger: 0, tracked: 0, due: 0, archived: [], batches: [], totalFeeXlm: '0' };
  if (!s.enabled) return { ...empty, skipped: 'disabled' };
  if (isWriterHoldActive()) return { ...empty, skipped: 'writer_hold' };

  const cfg = getNftNetworkConfig();
  const server: Rpc = deps.server ?? new StellarSdk.rpc.Server(cfg.rpcUrl);
  const kp = StellarSdk.Keypair.fromSecret(cfg.minterSecret);

  const entries = await collectEntries(server, cfg.contractId, kp.publicKey());
  const latest = (await server.getLatestLedger()).sequence;
  const { archived, due } = dueEntries(entries, latest, s.thresholdLedgers);
  const result: KeeperResult = { latestLedger: latest, tracked: entries.length, due: due.length, archived: archived.map((e) => e.label), batches: [], totalFeeXlm: '0' };
  let total = 0n;

  for (let i = 0; i < due.length; i += MAX_KEYS_PER_TX) {
    const chunk = due.slice(i, i + MAX_KEYS_PER_TX);
    const account = await server.getAccount(kp.publicKey());
    const tx = new StellarSdk.TransactionBuilder(account, { fee: '100', networkPassphrase: cfg.networkPassphrase })
      .addOperation(StellarSdk.Operation.extendFootprintTtl({ extendTo: s.targetLedgers }))
      .setSorobanData(new StellarSdk.SorobanDataBuilder().setReadOnly(chunk.map((c) => c.key)).build())
      .setTimeout(120)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
      result.batches.push({ entries: chunk.length, feeStroops: '0', feeXlm: '0', sent: false, error: `Simulation failed: ${String((sim as { error?: unknown }).error ?? 'unknown')}` });
      continue;
    }
    const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build();
    const fee = BigInt(prepared.fee);
    const batch: KeeperResult['batches'][number] = { entries: chunk.length, feeStroops: fee.toString(), feeXlm: stroopsToXlmText(fee), sent: false };
    total += fee;
    if (fee > s.maxFeeStroops) {
      batch.error = `Fee ${stroopsToXlmText(fee)} XLM is above the ${stroopsToXlmText(s.maxFeeStroops)} XLM cap. Nothing was sent.`;
    } else if (s.send) {
      prepared.sign(kp);
      const sent = await server.sendTransaction(prepared);
      batch.hash = sent.hash;
      if (sent.status === 'ERROR') {
        batch.error = `Send failed: ${describeSendError(sent.errorResult, fee.toString())}`;
      } else {
        let status = 'NOT_FOUND';
        for (let p = 0; p < 10 && status === 'NOT_FOUND'; p++) {
          await new Promise((r) => setTimeout(r, deps.server ? 0 : 3000));
          status = (await server.getTransaction(sent.hash)).status;
        }
        batch.sent = status === 'SUCCESS';
        if (!batch.sent) batch.error = `Transaction status ${status}`;
      }
    }
    result.batches.push(batch);
  }
  result.totalFeeXlm = stroopsToXlmText(total);
  logger.info({ event: 'nft_ttl_keeper', mode: s.send ? 'send' : 'dry_run', ...result }, 'NFT TTL keeper check');
  if (archived.length) logger.warn({ event: 'nft_ttl_archived', archived: result.archived }, 'Archived NFT entries need a restore (not done automatically)');
  return result;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startNftTtlKeeper(): void {
  const s = keeperSettings();
  if (!s.enabled || timer) return;
  const tick = () => { runTtlKeeper().catch((err) => logger.error({ err: String(err) }, 'NFT TTL keeper failed')); };
  tick();
  timer = setInterval(tick, s.intervalMs);
  timer.unref?.();
}

export function stopNftTtlKeeper(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
