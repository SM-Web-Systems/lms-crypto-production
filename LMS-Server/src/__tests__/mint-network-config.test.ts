/**
 * mint-network-config.test.ts
 *
 * TDD tests for NFT network parameterization.
 * These tests verify that mintService correctly selects network passphrase,
 * RPC URL, and contract ID based on NFT_STELLAR_NETWORK configuration.
 *
 * All tests run without real Soroban RPC calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// The function under test — will be created in mintService.ts
import { getNftNetworkConfig } from '../services/mintService.js';

// ── Env cleanup helper ──────────────────────────────────────────────────────

const NFT_ENV_KEYS = [
  'NFT_STELLAR_NETWORK',
  'NFT_SOROBAN_RPC_URL',
  'NFT_MINTER_SECRET',
  'NFT_CONTRACT_ID',
] as const;

function clearNftEnv() {
  for (const key of NFT_ENV_KEYS) {
    delete process.env[key];
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('getNftNetworkConfig', () => {
  beforeEach(() => {
    clearNftEnv();
  });

  afterEach(() => {
    clearNftEnv();
  });

  // ── Explicit network selection ──────────────────────────────────────────

  it('NET-1: returns public passphrase when NFT_STELLAR_NETWORK=public', () => {
    process.env.NFT_STELLAR_NETWORK = 'public';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    const config = getNftNetworkConfig();
    expect(config.networkPassphrase).toBe('Public Global Stellar Network ; September 2015');
    expect(config.network).toBe('public');
  });

  it('NET-2: returns testnet passphrase when NFT_STELLAR_NETWORK=testnet', () => {
    process.env.NFT_STELLAR_NETWORK = 'testnet';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    const config = getNftNetworkConfig();
    expect(config.networkPassphrase).toBe('Test SDF Network ; September 2015');
    expect(config.network).toBe('testnet');
  });

  it('NET-3: uses mainnet RPC URL for public network', () => {
    process.env.NFT_STELLAR_NETWORK = 'public';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    const config = getNftNetworkConfig();
    expect(config.rpcUrl).toBe('https://mainnet.sorobanrpc.com');
  });

  it('NET-4: uses testnet RPC URL for testnet network', () => {
    process.env.NFT_STELLAR_NETWORK = 'testnet';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    const config = getNftNetworkConfig();
    expect(config.rpcUrl).toBe('https://soroban-testnet.stellar.org');
  });

  it('NET-5: respects NFT_SOROBAN_RPC_URL override for any network', () => {
    process.env.NFT_STELLAR_NETWORK = 'public';
    process.env.NFT_SOROBAN_RPC_URL = 'https://custom-rpc.example.com';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    const config = getNftNetworkConfig();
    expect(config.rpcUrl).toBe('https://custom-rpc.example.com');
  });

  // ── Fail-closed: missing configuration ─────────────────────────────────

  it('NET-6: throws when NFT_STELLAR_NETWORK is not set', () => {
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    expect(() => getNftNetworkConfig()).toThrow(/NFT_STELLAR_NETWORK/);
  });

  it('NET-7: throws when NFT_STELLAR_NETWORK is empty string', () => {
    process.env.NFT_STELLAR_NETWORK = '';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    expect(() => getNftNetworkConfig()).toThrow(/NFT_STELLAR_NETWORK/);
  });

  it('NET-8: throws when NFT_STELLAR_NETWORK is invalid value', () => {
    process.env.NFT_STELLAR_NETWORK = 'mainnet'; // wrong — must be 'public' or 'testnet'
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    expect(() => getNftNetworkConfig()).toThrow(/NFT_STELLAR_NETWORK/);
  });

  it('NET-9: throws when NFT_MINTER_SECRET is missing', () => {
    process.env.NFT_STELLAR_NETWORK = 'public';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    expect(() => getNftNetworkConfig()).toThrow(/NFT_MINTER_SECRET/);
  });

  it('NET-10: throws when NFT_CONTRACT_ID is missing', () => {
    process.env.NFT_STELLAR_NETWORK = 'public';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';

    expect(() => getNftNetworkConfig()).toThrow(/NFT_CONTRACT_ID/);
  });

  // ── Cross-network prevention ───────────────────────────────────────────

  it('NET-11: public network never uses testnet passphrase', () => {
    process.env.NFT_STELLAR_NETWORK = 'public';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    const config = getNftNetworkConfig();
    expect(config.networkPassphrase).not.toBe('Test SDF Network ; September 2015');
  });

  it('NET-12: testnet network never uses public passphrase', () => {
    process.env.NFT_STELLAR_NETWORK = 'testnet';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    const config = getNftNetworkConfig();
    expect(config.networkPassphrase).not.toBe('Public Global Stellar Network ; September 2015');
  });

  // ── No silent fallback ─────────────────────────────────────────────────

  it('NET-13: does not silently default to public when network is unset', () => {
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';
    // NFT_STELLAR_NETWORK deliberately NOT set

    // Must throw, not silently return public config
    expect(() => getNftNetworkConfig()).toThrow();
  });

  it('NET-14: does not silently default to testnet when network is unset', () => {
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    // Must throw, not silently return testnet config
    expect(() => getNftNetworkConfig()).toThrow();
  });

  // ── Return shape ───────────────────────────────────────────────────────

  it('NET-15: returns all required fields', () => {
    process.env.NFT_STELLAR_NETWORK = 'public';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    const config = getNftNetworkConfig();
    expect(config).toHaveProperty('network');
    expect(config).toHaveProperty('networkPassphrase');
    expect(config).toHaveProperty('rpcUrl');
    expect(config).toHaveProperty('contractId');
    expect(config).toHaveProperty('minterSecret');
  });

  it('NET-16: minterSecret is not exposed in error messages', () => {
    process.env.NFT_STELLAR_NETWORK = 'invalid';
    process.env.NFT_MINTER_SECRET = 'SSUPER_SECRET_KEY_DO_NOT_LEAK';
    process.env.NFT_CONTRACT_ID = 'CTEST_PLACEHOLDER';

    try {
      getNftNetworkConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain('SSUPER_SECRET_KEY_DO_NOT_LEAK');
    }
  });

  // ── Backward compatibility ─────────────────────────────────────────────

  it('NET-17: contractId comes from NFT_CONTRACT_ID env var', () => {
    process.env.NFT_STELLAR_NETWORK = 'public';
    process.env.NFT_MINTER_SECRET = 'STEST_PLACEHOLDER';
    process.env.NFT_CONTRACT_ID = 'CSPECIFIC_CONTRACT_ID';

    const config = getNftNetworkConfig();
    expect(config.contractId).toBe('CSPECIFIC_CONTRACT_ID');
  });
});
