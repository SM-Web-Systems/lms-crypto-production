import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as StellarSdk from "@stellar/stellar-sdk";
import { encryptSecretKey, decryptSecretKey } from "../lib/keyManager";

interface WalletState {
  publicKey: string | null;
  encryptedSecret: string | null;
  network: "testnet" | "public";
  isLocked: boolean;

  createWallet: (pin: string) => Promise<string>;
  importWallet: (secret: string, pin: string) => Promise<string>;
  unlock: (pin: string) => Promise<string>; // returns secret
  lock: () => void;
  signTransaction: (xdr: string, pin: string) => Promise<string>;
  switchNetwork: (network: "testnet" | "public") => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      publicKey: null,
      encryptedSecret: null,
      network: "testnet",
      isLocked: true,

      createWallet: async (pin) => {
        const keypair = StellarSdk.Keypair.random();
        const encrypted = await encryptSecretKey(keypair.secret(), pin);

        set({
          publicKey: keypair.publicKey(),
          encryptedSecret: encrypted,
          isLocked: false,
        });

        // Fund on testnet
        if (get().network === "testnet") {
          await fetch(
            `https://friendbot.stellar.org?addr=${keypair.publicKey()}`
          );
        }

        return keypair.publicKey();
      },

      importWallet: async (secret, pin) => {
        const keypair = StellarSdk.Keypair.fromSecret(secret);
        const encrypted = await encryptSecretKey(secret, pin);

        set({
          publicKey: keypair.publicKey(),
          encryptedSecret: encrypted,
          isLocked: false,
        });

        return keypair.publicKey();
      },

      unlock: async (pin) => {
        const { encryptedSecret } = get();
        if (!encryptedSecret) throw new Error("No wallet found");
        const secret = await decryptSecretKey(encryptedSecret, pin);
        set({ isLocked: false });
        return secret;
      },

      lock: () => set({ isLocked: true }),

      signTransaction: async (xdr, pin) => {
        const secret = await get().unlock(pin);
        const keypair = StellarSdk.Keypair.fromSecret(secret);
        const network = get().network === "testnet"
          ? StellarSdk.Networks.TESTNET
          : StellarSdk.Networks.PUBLIC;

        const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, network);
        tx.sign(keypair);
        return tx.toXDR();
      },

      switchNetwork: (network) => set({ network }),
    }),
    {
      name: "amma-wallet",
      partialize: (state) => ({
        publicKey: state.publicKey,
        encryptedSecret: state.encryptedSecret,
        network: state.network,
      }),
    }
  )
);
