/**
 * nft-provider.test.ts — NftProvider interface, factory, and feature flag tests
 *
 * PROV-1: getNftProvider() returns LegacyStellarProvider by default
 * PROV-2: getNftProvider() returns LegacyStellarProvider when NFT_PROVIDER=legacy
 * PROV-3: getNftProvider() returns EnhancedStellarProvider when NFT_PROVIDER=enhanced
 * PROV-4: getNftProvider() falls back to legacy for invalid value
 * PROV-5: getNftProvider() falls back to legacy when NFT_PROVIDER is empty
 * PROV-6: provider.getProviderInfo() returns name, version, network without secrets
 * PROV-7: EnhancedStellarProvider.mint() throws PROVIDER_NOT_READY
 * PROV-8: EnhancedStellarProvider.reconcile() throws PROVIDER_NOT_READY
 * PROV-9: LegacyStellarProvider.getProviderInfo() includes capabilities
 * PROV-10: EnhancedStellarProvider.getProviderInfo() has empty capabilities
 * PROV-11: Provider cache invalidates on env change
 * PROV-12: Feature flag is case-insensitive
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getNftProvider, _resetProviderCache } from '../services/nftProvider.js';
import { LegacyStellarProvider } from '../services/providers/legacyStellarProvider.js';
import { EnhancedStellarProvider, ProviderNotReadyError } from '../services/providers/enhancedStellarProvider.js';

describe('NftProvider factory — getNftProvider()', () => {
  beforeEach(() => {
    _resetProviderCache();
    delete process.env.NFT_PROVIDER;
    process.env.NFT_STELLAR_NETWORK = 'testnet';
  });

  afterEach(() => {
    _resetProviderCache();
    delete process.env.NFT_PROVIDER;
    delete process.env.NFT_STELLAR_NETWORK;
  });

  it('PROV-1: returns LegacyStellarProvider by default (no env var)', () => {
    const provider = getNftProvider();
    expect(provider).toBeInstanceOf(LegacyStellarProvider);
    expect(provider.name).toBe('legacy-stellar');
  });

  it('PROV-2: returns LegacyStellarProvider when NFT_PROVIDER=legacy', () => {
    process.env.NFT_PROVIDER = 'legacy';
    const provider = getNftProvider();
    expect(provider).toBeInstanceOf(LegacyStellarProvider);
  });

  it('PROV-3: returns EnhancedStellarProvider when NFT_PROVIDER=enhanced', () => {
    process.env.NFT_PROVIDER = 'enhanced';
    const provider = getNftProvider();
    expect(provider).toBeInstanceOf(EnhancedStellarProvider);
    expect(provider.name).toBe('enhanced-stellar');
  });

  it('PROV-4: falls back to legacy for invalid value', () => {
    process.env.NFT_PROVIDER = 'nonexistent';
    const provider = getNftProvider();
    expect(provider).toBeInstanceOf(LegacyStellarProvider);
  });

  it('PROV-5: falls back to legacy when NFT_PROVIDER is empty', () => {
    process.env.NFT_PROVIDER = '';
    const provider = getNftProvider();
    expect(provider).toBeInstanceOf(LegacyStellarProvider);
  });

  it('PROV-6: getProviderInfo() returns name, version, network without secrets', () => {
    const provider = getNftProvider();
    const info = provider.getProviderInfo();
    expect(info.name).toBe('legacy-stellar');
    expect(info.version).toBe('1.0.0');
    expect(info.network).toBe('testnet');
    expect(info.capabilities).toContain('mint');
    // Must not contain any secret values
    const infoStr = JSON.stringify(info);
    expect(infoStr).not.toContain('SECRET');
    expect(infoStr).not.toContain('PRIVATE');
    expect(infoStr).not.toContain('SEED');
  });

  it('PROV-7: EnhancedStellarProvider.mint() throws PROVIDER_NOT_READY', async () => {
    process.env.NFT_PROVIDER = 'enhanced';
    const provider = getNftProvider();
    await expect(provider.mint({
      userId: 'test-user',
      walletAddress: 'GTEST',
    })).rejects.toThrow(ProviderNotReadyError);
  });

  it('PROV-8: EnhancedStellarProvider.reconcile() throws PROVIDER_NOT_READY', async () => {
    process.env.NFT_PROVIDER = 'enhanced';
    const provider = getNftProvider();
    await expect(provider.reconcile('test-cred-id')).rejects.toThrow(ProviderNotReadyError);
  });

  it('PROV-9: LegacyStellarProvider includes capabilities', () => {
    const provider = getNftProvider();
    const info = provider.getProviderInfo();
    expect(info.capabilities).toEqual(['mint', 'reconcile', 'metadata']);
  });

  it('PROV-10: EnhancedStellarProvider has empty capabilities', () => {
    process.env.NFT_PROVIDER = 'enhanced';
    const provider = getNftProvider();
    const info = provider.getProviderInfo();
    expect(info.capabilities).toEqual([]);
  });

  it('PROV-11: provider cache invalidates on env change', () => {
    const p1 = getNftProvider();
    expect(p1).toBeInstanceOf(LegacyStellarProvider);

    process.env.NFT_PROVIDER = 'enhanced';
    _resetProviderCache();
    const p2 = getNftProvider();
    expect(p2).toBeInstanceOf(EnhancedStellarProvider);
  });

  it('PROV-12: feature flag is case-insensitive', () => {
    process.env.NFT_PROVIDER = 'ENHANCED';
    const provider = getNftProvider();
    expect(provider).toBeInstanceOf(EnhancedStellarProvider);

    _resetProviderCache();
    process.env.NFT_PROVIDER = 'Legacy';
    const provider2 = getNftProvider();
    expect(provider2).toBeInstanceOf(LegacyStellarProvider);
  });
});
