// packages/mobile/src/shared/lib/hd-wallet.ts
//
// SEP-0005 compliant HD wallet using stellar-hd-wallet.
// Derivation path: m/44'/148'/index'
//
import StellarHDWallet from "stellar-hd-wallet";

/**
 * Generate a new 24-word BIP-39 mnemonic (256 bits of entropy).
 * SEP-0005 strongly recommends 24 words.
 */
export function generateMnemonic(): string {
  return StellarHDWallet.generateMnemonic(); // defaults to 256 bits = 24 words
}

/**
 * Validate a mnemonic phrase.
 */
export function validateMnemonic(mnemonic: string): boolean {
  return StellarHDWallet.validateMnemonic(mnemonic.trim());
}

/**
 * Derive a Stellar keypair from a mnemonic at the given account index.
 * Path: m/44'/148'/{index}'
 */
export function keypairFromMnemonic(
  mnemonic: string,
  accountIndex: number = 0
): { publicKey: string; secretKey: string } {
  const wallet = StellarHDWallet.fromMnemonic(mnemonic.trim());
  return {
    publicKey: wallet.getPublicKey(accountIndex),
    secretKey: wallet.getSecret(accountIndex),
  };
}

/**
 * Derive multiple keypairs from a single mnemonic (for multi-account).
 */
export function deriveAccounts(
  mnemonic: string,
  count: number = 5
): Array<{ publicKey: string; secretKey: string; index: number }> {
  const wallet = StellarHDWallet.fromMnemonic(mnemonic.trim());
  const accounts = [];
  for (let i = 0; i < count; i++) {
    accounts.push({
      publicKey: wallet.getPublicKey(i),
      secretKey: wallet.getSecret(i),
      index: i,
    });
  }
  return accounts;
}
