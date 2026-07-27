import StellarHDWallet from "stellar-hd-wallet";
import { validateMnemonic } from "bip39";

/**
 * Derive a Stellar keypair from a BIP39 mnemonic using SEP-0005 path (m/44'/148'/index').
 * All derivation happens client-side — the mnemonic never leaves the browser.
 */
export function deriveHDKeypair(
  mnemonic: string,
  accountIndex: number = 0
): { publicKey: string; secretKey: string } {
  if (!mnemonic || !validateMnemonic(mnemonic.trim())) {
    throw new Error("Invalid mnemonic phrase");
  }
  const wallet = StellarHDWallet.fromMnemonic(mnemonic.trim());
  return {
    publicKey: wallet.getPublicKey(accountIndex),
    secretKey: wallet.getSecret(accountIndex),
  };
}

/**
 * Validate a BIP39 mnemonic phrase client-side.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  if (!mnemonic) return false;
  return validateMnemonic(mnemonic.trim());
}
