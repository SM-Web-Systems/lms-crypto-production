/**
 * Course mint fee guard (Learner B, 19 Nov 2026): Stellar rejected the mint with txInsufficientBalance
 * because the assembled fee was 24.85 XLM, above what the minter held. The service must refuse to sign
 * a fee above the cap, and a rejected send must say why in plain words.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import { mintCredential, describeSendError, stroopsToXlmText, maxMintFeeStroops } from '../services/mintService.js';

const minter = StellarSdk.Keypair.random();
const CONTRACT = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';
const WALLET = 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I';

function simulation(resourceFee: number) {
  return {
    id: '1', latestLedger: 1, events: [], _parsed: true,
    minResourceFee: String(resourceFee),
    transactionData: new StellarSdk.SorobanDataBuilder().setResourceFee(resourceFee),
    result: { auth: [], retval: StellarSdk.xdr.ScVal.scvVoid() },
  } as unknown as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;
}

const params = { userId: 'u1', courseId: 'c1', walletAddress: WALLET, applicationId: 'a1' };

beforeEach(() => {
  process.env.NFT_STELLAR_NETWORK = 'public';
  process.env.NFT_MINTER_SECRET = minter.secret();
  process.env.NFT_CONTRACT_ID = CONTRACT;
  vi.spyOn(StellarSdk.rpc.Server.prototype, 'getAccount').mockResolvedValue(new StellarSdk.Account(minter.publicKey(), '100'));
});
afterEach(() => {
  delete process.env.NFT_STELLAR_NETWORK; delete process.env.NFT_MINTER_SECRET; delete process.env.NFT_CONTRACT_ID; delete process.env.NFT_MAX_FEE_STROOPS;
  vi.restoreAllMocks();
});

describe('course mint fee cap', () => {
  it('refuses to sign or send when the fee is above the cap (Learner B case: ~24.85 XLM)', async () => {
    vi.spyOn(StellarSdk.rpc.Server.prototype, 'simulateTransaction').mockResolvedValue(simulation(247_510_719));
    const send = vi.spyOn(StellarSdk.rpc.Server.prototype, 'sendTransaction');
    await expect(mintCredential(params)).rejects.toThrow(/Mint fee 24\.8510719 XLM is above the 2 XLM cap.*Nothing was sent/);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a normal-sized fee and explains a rejected send in plain words', async () => {
    vi.spyOn(StellarSdk.rpc.Server.prototype, 'simulateTransaction').mockResolvedValue(simulation(150_000));
    const errorResult = new StellarSdk.xdr.TransactionResult({
      feeCharged: new StellarSdk.xdr.Int64(1_150_000),
      result: StellarSdk.xdr.TransactionResultResult.txInsufficientBalance(),
      ext: new StellarSdk.xdr.TransactionResultExt(0),
    });
    const send = vi.spyOn(StellarSdk.rpc.Server.prototype, 'sendTransaction')
      .mockResolvedValue({ status: 'ERROR', hash: 'h', latestLedger: 1, latestLedgerCloseTime: 0, errorResult } as never);
    await expect(mintCredential(params)).rejects.toThrow('Send failed: txInsufficientBalance (fee 0.115 XLM). The minter account does not hold enough XLM to pay this fee.');
    expect(send).toHaveBeenCalledOnce();
  });

  it('reads the cap from NFT_MAX_FEE_STROOPS and ignores bad values', () => {
    expect(maxMintFeeStroops()).toBe(20_000_000n);
    process.env.NFT_MAX_FEE_STROOPS = '50000000';
    expect(maxMintFeeStroops()).toBe(50_000_000n);
    process.env.NFT_MAX_FEE_STROOPS = 'lots';
    expect(maxMintFeeStroops()).toBe(20_000_000n);
  });

  it('formats stroops as XLM and survives an unreadable error result', () => {
    expect(stroopsToXlmText(248_510_719n)).toBe('24.8510719');
    expect(stroopsToXlmText('10000000')).toBe('1');
    expect(describeSendError(undefined, '100')).toBe('unknown (fee 0.00001 XLM).');
  });
});
