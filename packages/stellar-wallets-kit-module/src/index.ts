/**
 * Amma Wallet Module for Stellar Wallets Kit
 *
 * This module integrates Amma Wallet with the Stellar Wallets Kit,
 * allowing any dApp using the kit to offer Amma Wallet as a connection option.
 *
 * @example
 * ```ts
 * import { StellarWalletsKit, WalletNetwork } from "@creit.tech/stellar-wallets-kit";
 * import { AmmaWalletModule, AMMA_WALLET_ID } from "@amma-wallet/stellar-wallets-kit-module";
 *
 * const kit = new StellarWalletsKit({
 *   network: WalletNetwork.TESTNET,
 *   selectedWalletId: AMMA_WALLET_ID,
 *   modules: [new AmmaWalletModule()],
 * });
 * ```
 */

import type { ModuleInterface, ModuleType } from "@creit.tech/stellar-wallets-kit";

export const AMMA_WALLET_ID = "amma-wallet";

interface AmmaWalletProvider {
  isAmmaWallet: true;
  isConnected(): Promise<boolean>;
  connect(): Promise<{ address: string }>;
  disconnect(): Promise<void>;
  getAddress(): Promise<{ address: string }>;
  getNetwork(): Promise<{ network: string; networkPassphrase: string }>;
  signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<{ signedTxXdr: string; signerAddress?: string }>;
  signAuthEntry(
    authEntry: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<{ signedAuthEntry: string; signerAddress?: string }>;
  signMessage(
    message: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<{ signedMessage: string; signerAddress?: string }>;
}

declare global {
  interface Window {
    ammaWallet?: AmmaWalletProvider;
  }
}

function getProvider(): AmmaWalletProvider {
  if (typeof window === "undefined" || !window.ammaWallet) {
    throw new Error(
      "Amma Wallet is not installed. Get it at https://ammawallet.com"
    );
  }
  return window.ammaWallet;
}

/**
 * Wait for the Amma Wallet provider to be injected.
 * The extension injects asynchronously, so we poll briefly.
 */
function waitForProvider(timeoutMs = 1000): Promise<AmmaWalletProvider | null> {
  return new Promise((resolve) => {
    if (window.ammaWallet) {
      resolve(window.ammaWallet);
      return;
    }

    const handler = () => {
      window.removeEventListener("ammaWallet:ready", handler);
      resolve(window.ammaWallet || null);
    };
    window.addEventListener("ammaWallet:ready", handler);

    // Also poll in case event was missed
    const interval = setInterval(() => {
      if (window.ammaWallet) {
        clearInterval(interval);
        window.removeEventListener("ammaWallet:ready", handler);
        resolve(window.ammaWallet);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      window.removeEventListener("ammaWallet:ready", handler);
      resolve(window.ammaWallet || null);
    }, timeoutMs);
  });
}

export class AmmaWalletModule implements ModuleInterface {
  moduleType: ModuleType = "HOT_WALLET" as ModuleType;
  productId: string = AMMA_WALLET_ID;
  productName: string = "Amma Wallet";
  productUrl: string = "https://ammawallet.com";
  productIcon: string =
    "https://ammawallet.com/icons/icon-128.png";

  private onChangeCallback?: (event: any) => void;

  async isAvailable(): Promise<boolean> {
    const provider = await waitForProvider(800);
    return !!provider?.isAmmaWallet;
  }

  onChange(callback: (event: any) => void): void {
    this.onChangeCallback = callback;
  }

  async getAddress(params?: {
    path?: string;
    skipRequestAccess?: boolean;
  }): Promise<{ address: string }> {
    const provider = getProvider();

    // If not connected yet, initiate connection
    const connected = await provider.isConnected();
    if (!connected) {
      const result = await provider.connect();
      return { address: result.address };
    }

    return provider.getAddress();
  }

  async signTransaction(
    xdr: string,
    opts?: {
      networkPassphrase?: string;
      address?: string;
      path?: string;
    }
  ): Promise<{ signedTxXdr: string; signerAddress?: string }> {
    const provider = getProvider();
    return provider.signTransaction(xdr, {
      networkPassphrase: opts?.networkPassphrase,
      address: opts?.address,
    });
  }

  async signAuthEntry(
    authEntry: string,
    opts?: {
      networkPassphrase?: string;
      address?: string;
      path?: string;
    }
  ): Promise<{ signedAuthEntry: string; signerAddress?: string }> {
    const provider = getProvider();
    return provider.signAuthEntry(authEntry, {
      networkPassphrase: opts?.networkPassphrase,
      address: opts?.address,
    });
  }

  async signMessage(
    message: string,
    opts?: {
      networkPassphrase?: string;
      address?: string;
      path?: string;
    }
  ): Promise<{ signedMessage: string; signerAddress?: string }> {
    const provider = getProvider();
    return provider.signMessage(message, {
      networkPassphrase: opts?.networkPassphrase,
      address: opts?.address,
    });
  }

  async getNetwork(): Promise<{
    network: string;
    networkPassphrase: string;
  }> {
    const provider = getProvider();
    return provider.getNetwork();
  }

  async disconnect(): Promise<void> {
    try {
      const provider = getProvider();
      await provider.disconnect();
    } catch {
      // Provider might not be available, that's fine
    }
  }
}
