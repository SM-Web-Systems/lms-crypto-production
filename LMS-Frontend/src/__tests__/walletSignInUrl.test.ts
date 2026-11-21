import { describe, expect, it } from 'vitest';
import { resolveAmmaWalletUrl } from '../utils/walletSignIn';

describe('resolveAmmaWalletUrl', () => {
  it('uses the configured wallet (staging points at testnet)', () => {
    expect(resolveAmmaWalletUrl('https://testnet.ammawallet.com/')).toBe('https://testnet.ammawallet.com');
  });

  it('falls back to the mainnet wallet when nothing is configured', () => {
    expect(resolveAmmaWalletUrl(undefined)).toBe('https://ammawallet.com');
    expect(resolveAmmaWalletUrl('  ')).toBe('https://ammawallet.com');
  });
});
