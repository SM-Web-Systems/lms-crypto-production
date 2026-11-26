import * as StellarSdk from '@stellar/stellar-sdk';
import { getNftNetworkConfig } from './mintService.js';

/** F24: what admins need to know before minting: is there enough XLM in the minter wallet? */
export interface MinterBalance {
  /** False when this server has no minter or contract configured; the other fields are then empty. */
  configured: boolean;
  /** False when the minter account does not exist on the network yet (never funded). */
  funded: boolean;
  network: string;
  contractId: string;
  publicKey: string;
  balanceXlm: string;
  /** Balance above the account's minimum reserve, which is what minting can spend. */
  availableXlm: string;
  /** Rough number of mints the available balance covers at the configured per-mint estimate. */
  estimatedMintsLeft: number;
  low: boolean;
  checkedAt: string;
}

const STROOPS = 10_000_000n;
const BASE_RESERVE_STROOPS = 5_000_000n; // 0.5 XLM per entry (protocol base reserve)
let cache: { at: number; value: MinterBalance } | null = null;

const toXlm = (stroops: bigint) => {
  const sign = stroops < 0n ? '-' : '';
  const abs = stroops < 0n ? -stroops : stroops;
  return `${sign}${abs / STROOPS}.${(abs % STROOPS).toString().padStart(7, '0')}`;
};

export async function getMinterBalance(opts: { fresh?: boolean } = {}): Promise<MinterBalance> {
  if (!opts.fresh && cache && Date.now() - cache.at < 60_000) return cache.value;
  let cfg: ReturnType<typeof getNftNetworkConfig>;
  try {
    cfg = getNftNetworkConfig();
  } catch {
    return { configured: false, funded: false, network: '', contractId: '', publicKey: '', balanceXlm: '0.0000000', availableXlm: '0.0000000', estimatedMintsLeft: 0, low: true, checkedAt: new Date().toISOString() };
  }
  const publicKey = StellarSdk.Keypair.fromSecret(cfg.minterSecret).publicKey();
  let balance = 0n, subEntries = 0n, funded = true;
  try {
    const entry = await new StellarSdk.rpc.Server(cfg.rpcUrl).getAccountEntry(publicKey);
    balance = BigInt(entry.balance().toString());
    subEntries = BigInt(entry.numSubEntries());
  } catch (err) {
    // An unfunded account does not exist on the ledger yet; anything else (RPC down) is a real error.
    if (!/not found/i.test(err instanceof Error ? err.message : String(err))) throw err;
    funded = false;
  }
  const reserve = (2n + subEntries) * BASE_RESERVE_STROOPS;
  const available = balance > reserve ? balance - reserve : 0n;
  const perMint = BigInt(Math.round(Number(process.env.NFT_MINT_COST_ESTIMATE_XLM || '0.12') * 1e7)) || 1_200_000n;
  const lowXlm = Number(process.env.NFT_MINTER_LOW_BALANCE_XLM || '2');
  const value: MinterBalance = {
    configured: true,
    funded,
    network: cfg.network,
    contractId: cfg.contractId,
    publicKey,
    balanceXlm: toXlm(balance),
    availableXlm: toXlm(available),
    estimatedMintsLeft: Number(available / perMint),
    low: Number(available) / 1e7 < lowXlm,
    checkedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Test hook. */
export function clearMinterBalanceCache(): void { cache = null; }
