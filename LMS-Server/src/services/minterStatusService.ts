/**
 * Read-only status of the NFT minter wallet for administrators: its public address and XLM balance.
 * Admins could not see the minter balance anywhere, so a run of mints could fail mid-way for lack of fees.
 * Derives the public key from the configured secret (never returned), reads Horizon, signs and submits nothing.
 */
import * as StellarSdk from '@stellar/stellar-sdk';
import { getNftNetworkConfig } from './mintService.js';

const HORIZON: Record<'public' | 'testnet', string> = {
  public: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

/** Below this balance the admin screen warns that minting may soon fail (each mint costs about 0.11 XLM). */
export const MINTER_LOW_BALANCE_XLM = 3;

export interface MinterStatus {
  configured: boolean;
  network: 'public' | 'testnet' | null;
  minterAddress: string | null;
  contractId: string | null;
  balanceXlm: string | null;
  low: boolean;
  error: string | null;
}

type Fetch = typeof fetch;

export async function getMinterStatus(fetchImpl: Fetch = fetch): Promise<MinterStatus> {
  let cfg: ReturnType<typeof getNftNetworkConfig>;
  try {
    cfg = getNftNetworkConfig();
  } catch {
    return { configured: false, network: null, minterAddress: null, contractId: null, balanceXlm: null, low: false, error: 'Certificate minting is not configured on this server.' };
  }
  let minterAddress: string;
  try {
    minterAddress = StellarSdk.Keypair.fromSecret(cfg.minterSecret).publicKey();
  } catch {
    return { configured: false, network: cfg.network, minterAddress: null, contractId: cfg.contractId, balanceXlm: null, low: false, error: 'The minter key is not valid.' };
  }
  const base = { configured: true, network: cfg.network, minterAddress, contractId: cfg.contractId };
  try {
    const res = await fetchImpl(`${HORIZON[cfg.network]}/accounts/${minterAddress}`, {
      signal: AbortSignal.timeout(5000), redirect: 'error', headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return { ...base, balanceXlm: '0', low: true, error: 'The minter account does not exist on this network yet (not funded).' };
    if (!res.ok) throw new Error('horizon');
    const body = await res.json() as { balances?: { asset_type: string; balance: string }[] };
    const native = body.balances?.find(b => b.asset_type === 'native')?.balance ?? '0';
    return { ...base, balanceXlm: native, low: Number(native) < MINTER_LOW_BALANCE_XLM, error: null };
  } catch {
    return { ...base, balanceXlm: null, low: false, error: 'The Stellar network could not be reached. Try again shortly.' };
  }
}
