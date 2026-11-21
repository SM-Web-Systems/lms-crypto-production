import { describe, it, expect } from 'vitest';
import { formatXlm, stroopsToXlm } from '../../utils/xlmAmount';

describe('formatXlm', () => {
  it('shows the USDC value next to the XLM amount when a price exists', () => {
    expect(formatXlm(2_000_000, 0.3)).toBe('0.2 XLM (≈ 0.06 USDC)');
  });

  it('shows only the XLM amount when there is no price', () => {
    expect(formatXlm(2_000_000, null)).toBe('0.2 XLM');
    expect(formatXlm(2_000_000)).toBe('0.2 XLM');
  });

  it('keeps full precision and never rounds a tiny amount to zero', () => {
    expect(formatXlm(1)).toBe('0.0000001 XLM');
    expect(formatXlm(1, 0.3)).toBe('0.0000001 XLM (< 0.01 USDC)');
    expect(formatXlm('123456789')).toBe('12.3456789 XLM');
  });

  it('shows zero as zero', () => {
    expect(formatXlm(0, 0.3)).toBe('0 XLM (≈ 0.00 USDC)');
  });

  it('uses the record currency, and adds no USDC value to a non-XLM amount', () => {
    expect(formatXlm(2_000_000, 0.3, 'USDC')).toBe('0.2 USDC');
  });
});

describe('stroopsToXlm', () => {
  it('converts whole stroops exactly and trims trailing zeros', () => {
    expect(stroopsToXlm(10_000_000)).toBe('1');
    expect(stroopsToXlm('15000000')).toBe('1.5');
  });
});

describe('stellarTxUrl', () => {
  it('links testnet records to the testnet explorer and everything else to public', async () => {
    const { stellarTxUrl } = await import('../../utils/stellarExplorer');
    expect(stellarTxUrl('abc', 'testnet')).toBe('https://stellar.expert/explorer/testnet/tx/abc');
    expect(stellarTxUrl('abc', 'public')).toBe('https://stellar.expert/explorer/public/tx/abc');
    expect(stellarTxUrl('abc', null)).toBe('https://stellar.expert/explorer/public/tx/abc');
  });
});
