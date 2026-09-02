import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateKeypair, keypairFromSecret, fundTestnet } from "../lib/stellar";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { userWalletApi } from "../lib/api";
import { deriveHDKeypair, isValidMnemonic } from "../lib/hd-wallet";

export interface WalletAccount {
  id: string;
  serverId?: number;
  name: string;
  publicKey: string;
  encryptedSecret: string;
  createdAt: number;
  isHD?: boolean;
  derivationIndex?: number;
}

interface WalletState {
  accounts: WalletAccount[];
  activeAccountId: string | null;
  network: "testnet" | "public";
  isUnlocked: boolean;
  _secretKey: string | null;
  _syncing: boolean;
  _mnemonic: string | null;

  getPublicKey: () => string | null;
  activeAccount: () => WalletAccount | null;
  createWallet: (name: string, pin: string) => Promise<string>;
  importWallet: (name: string, secretKey: string, pin: string) => Promise<string>;
  createWalletFromMnemonic: (name: string, pin: string, mnemonic: string, accountIndex?: number) => Promise<{ publicKey: string; mnemonic: string }>;
  importFromMnemonic: (name: string, mnemonic: string, pin: string, accountIndex?: number) => Promise<string>;
  generateMnemonic: () => Promise<string>;
  switchAccount: (accountId: string) => void;
  removeAccount: (accountId: string) => void;
  renameAccount: (accountId: string, newName: string) => void;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  logout: () => void;
  getSecretKey: () => string;
  getMnemonic: () => string | null;
  setNetwork: (n: "testnet" | "public") => void;
  syncFromServer: () => Promise<void>;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,
      network: (import.meta.env.VITE_DEFAULT_NETWORK as "testnet" | "public") || "public",
      isUnlocked: false,
      _secretKey: null,
      _syncing: false,
      _mnemonic: null,

      getPublicKey: () => {
        const state = get();
        const active = state.accounts.find((a) => a.id === state.activeAccountId);
        return active?.publicKey ?? null;
      },

      activeAccount: () => {
        const state = get();
        return state.accounts.find((a) => a.id === state.activeAccountId) ?? null;
      },

      // ─── Sync from server ─────────────────────
      syncFromServer: async () => {
        if (get()._syncing) return;
        set({ _syncing: true });
        try {
          const serverWallets = await userWalletApi.list();
          if (!serverWallets || serverWallets.length === 0) {
            set({ _syncing: false });
            return;
          }

          const localAccounts = get().accounts;
          const merged: WalletAccount[] = [];
          const seenPubkeys = new Set<string>();

          for (const local of localAccounts) {
            const serverMatch = serverWallets.find(
              (sw: any) => sw.publicKey === local.publicKey
            );
            merged.push({
              ...local,
              serverId: serverMatch?.id ?? local.serverId,
              encryptedSecret: local.encryptedSecret || serverMatch?.encryptedSecret || "",
            });
            seenPubkeys.add(local.publicKey);
          }

          for (const sw of serverWallets) {
            if (!seenPubkeys.has(sw.publicKey)) {
              merged.push({
                id: generateId(),
                serverId: sw.id,
                name: sw.name,
                publicKey: sw.publicKey,
                encryptedSecret: sw.encryptedSecret || "",
                createdAt: new Date(sw.createdAt).getTime(),
              });
            }
          }

          const activeServer = serverWallets.find((sw: any) => sw.isActive);
          const currentActiveId = get().activeAccountId;
          let newActiveId = currentActiveId;

          if (!currentActiveId || !merged.find((m) => m.id === currentActiveId)) {
            if (activeServer) {
              const match = merged.find((m) => m.publicKey === activeServer.publicKey);
              newActiveId = match?.id ?? merged[0]?.id ?? null;
            } else {
              newActiveId = merged[0]?.id ?? null;
            }
          }

          set({
            accounts: merged,
            activeAccountId: newActiveId,
            _syncing: false,
          });
        } catch (err) {
          console.error("Wallet sync failed:", err);
          set({ _syncing: false });
        }
      },

      // ─── Create (random keypair) ──────────────
      createWallet: async (name, pin) => {
        const trimmedName = (name || `Wallet ${get().accounts.length + 1}`).trim();
        if (get().accounts.some((a) => a.name.toLowerCase() === trimmedName.toLowerCase())) {
          throw new Error("A wallet with this name already exists");
        }

        const { publicKey, secretKey } = generateKeypair();
        const encrypted = await encryptSecret(secretKey, pin);

        let serverId: number | undefined;
        try {
          const serverWallet = await userWalletApi.add({
            name: trimmedName,
            publicKey,
            encryptedSecret: encrypted,
            network: get().network,
          });
          serverId = serverWallet.id;
        } catch (err: any) {
          if (err.message?.includes("already exists")) {
            throw new Error("A wallet with this name already exists");
          }
          console.error("Failed to sync wallet to server:", err);
        }

        const account: WalletAccount = {
          id: generateId(),
          serverId,
          name: trimmedName,
          publicKey,
          encryptedSecret: encrypted,
          createdAt: Date.now(),
        };

        set((state) => ({
          accounts: [...state.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
        }));

        // On testnet builds, auto-fund new wallets via Friendbot
        if (import.meta.env.VITE_DEFAULT_NETWORK === "testnet") {
          fundTestnet(publicKey).catch(() => {});
        }

        return publicKey;
      },

      // ─── Import (secret key) ──────────────────
      importWallet: async (name, secretKey, pin) => {
        const { publicKey } = keypairFromSecret(secretKey);

        if (get().accounts.some((a) => a.publicKey === publicKey)) {
          throw new Error("This wallet is already added");
        }

        const encrypted = await encryptSecret(secretKey, pin);

        const account: WalletAccount = {
          id: generateId(),
          name: name || `Imported ${get().accounts.length + 1}`,
          publicKey,
          encryptedSecret: encrypted,
          createdAt: Date.now(),
        };

        try {
          const serverWallet = await userWalletApi.add({
            name: account.name,
            publicKey,
            encryptedSecret: encrypted,
            network: get().network,
          });
          account.serverId = serverWallet.id;
        } catch (err) {
          console.error("Failed to sync wallet to server:", err);
        }

        set((state) => ({
          accounts: [...state.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
        }));

        return publicKey;
      },

      // ─── Generate mnemonic ────────────────────
      generateMnemonic: async () => {
        // Fallback: generate via crypto API
        // For web app, we use the backend keypair API
        // Actually, let's use bip39 directly if available
        const { generateMnemonic: gen } = await import("bip39");
        return gen();
      },

      // ─── Create from mnemonic ─────────────────
      createWalletFromMnemonic: async (name, pin, mnemonic, accountIndex = 0) => {
        const trimmedName = (name || `HD Wallet ${get().accounts.length + 1}`).trim();
        if (get().accounts.some((a) => a.name.toLowerCase() === trimmedName.toLowerCase())) {
          throw new Error("A wallet with this name already exists");
        }

        // Derive keypair client-side — mnemonic never leaves the browser
        const derived = deriveHDKeypair(mnemonic, accountIndex);
        const { publicKey, secretKey } = derived;

        if (get().accounts.some((a) => a.publicKey === publicKey)) {
          throw new Error("This wallet is already added");
        }

        const encrypted = await encryptSecret(secretKey, pin);

        let serverId: number | undefined;
        try {
          const serverWallet = await userWalletApi.add({
            name: trimmedName,
            publicKey,
            encryptedSecret: encrypted,
            network: get().network,
          });
          serverId = serverWallet.id;
        } catch (err: any) {
          if (err.message?.includes("already exists")) {
            throw new Error("A wallet with this name already exists");
          }
          console.error("Failed to sync wallet to server:", err);
        }

        const account: WalletAccount = {
          id: generateId(),
          serverId,
          name: trimmedName,
          publicKey,
          encryptedSecret: encrypted,
          createdAt: Date.now(),
          isHD: true,
          derivationIndex: accountIndex,
        };

        set((state) => ({
          accounts: [...state.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
          _mnemonic: mnemonic,
        }));

        // On testnet builds, auto-fund new wallets via Friendbot
        if (import.meta.env.VITE_DEFAULT_NETWORK === "testnet") {
          fundTestnet(publicKey).catch(() => {});
        }

        return { publicKey, mnemonic };
      },

      // ─── Import from mnemonic ─────────────────
      importFromMnemonic: async (name, mnemonic, pin, accountIndex = 0) => {
        // Validate mnemonic client-side — no server call needed
        if (!isValidMnemonic(mnemonic)) {
          throw new Error("Invalid recovery phrase");
        }

        const derived = deriveHDKeypair(mnemonic, accountIndex);
        const { publicKey, secretKey } = derived;

        if (get().accounts.some((a) => a.publicKey === publicKey)) {
          throw new Error("This wallet is already added");
        }

        const encrypted = await encryptSecret(secretKey, pin);

        let serverId: number | undefined;
        try {
          const serverWallet = await userWalletApi.add({
            name: name || `HD Wallet ${get().accounts.length + 1}`,
            publicKey,
            encryptedSecret: encrypted,
            network: get().network,
          });
          serverId = serverWallet.id;
        } catch (err) {
          console.error("Failed to sync wallet to server:", err);
        }

        const account: WalletAccount = {
          id: generateId(),
          serverId,
          name: name || `HD Wallet ${get().accounts.length + 1}`,
          publicKey,
          encryptedSecret: encrypted,
          createdAt: Date.now(),
          isHD: true,
          derivationIndex: accountIndex,
        };

        set((state) => ({
          accounts: [...state.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
          _mnemonic: mnemonic,
        }));

        return publicKey;
      },

      // ─── Switch ───────────────────────────────
      switchAccount: (accountId) => {
        const account = get().accounts.find((a) => a.id === accountId);
        if (!account) throw new Error("Account not found");

        if (account.serverId) {
          userWalletApi.activate(account.serverId).catch(console.error);
        }

        set({
          activeAccountId: accountId,
          isUnlocked: false,
          _secretKey: null,
          _mnemonic: null,
        });
      },

      // ─── Remove ───────────────────────────────
      removeAccount: (accountId) => {
        const { accounts, activeAccountId } = get();
        const account = accounts.find((a) => a.id === accountId);
        if (account?.serverId) {
          userWalletApi.remove(account.serverId).catch(console.error);
        }
        // Clean up stored mnemonic
        if (account) {
          localStorage.removeItem(`mnemonic_${account.publicKey}`);
        }
        const remaining = accounts.filter((a) => a.id !== accountId);
        let newActiveId = activeAccountId;
        if (activeAccountId === accountId) {
          newActiveId = remaining.length > 0 ? remaining[0].id : null;
        }
        set({ accounts: remaining, activeAccountId: newActiveId, isUnlocked: false, _secretKey: null, _mnemonic: null });
      },

      // ─── Rename ───────────────────────────────
      renameAccount: (accountId, newName) => {
        const account = get().accounts.find((a) => a.id === accountId);
        if (account?.serverId) {
          userWalletApi.rename(account.serverId, newName).catch(console.error);
        }
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === accountId ? { ...a, name: newName } : a
          ),
        }));
      },

      // ─── Auth ─────────────────────────────────
      unlock: async (pin) => {
        const account = get().activeAccount();
        if (!account) throw new Error("No active account");
        const secretKey = await decryptSecret(account.encryptedSecret, pin);

        // Also try to decrypt mnemonic if HD wallet
        let mnemonic: string | null = null;
        if (account.isHD) {
          const encMnemonic = localStorage.getItem(`mnemonic_${account.publicKey}`);
          if (encMnemonic) {
            try {
              mnemonic = await decryptSecret(encMnemonic, pin);
            } catch {}
          }
        }

        set({ isUnlocked: true, _secretKey: secretKey, _mnemonic: mnemonic });
      },

      lock: () => set({ isUnlocked: false, _secretKey: null, _mnemonic: null }),

      logout: () => {
        // Clean up all mnemonics
        const accounts = get().accounts;
        for (const acc of accounts) {
          localStorage.removeItem(`mnemonic_${acc.publicKey}`);
        }
        set({
          accounts: [],
          activeAccountId: null,
          isUnlocked: false,
          _secretKey: null,
          _mnemonic: null,
        });
      },

      getSecretKey: () => {
        const sk = get()._secretKey;
        if (!sk) throw new Error("Wallet is locked");
        return sk;
      },

      getMnemonic: () => {
        return get()._mnemonic;
      },

      setNetwork: (n) => set({ network: n }),
    }),
    {
      name: "amma-wallet",
      partialize: (state) => ({
        accounts: state.accounts.map(({ encryptedSecret, ...rest }) => rest),
        activeAccountId: state.activeAccountId,
        // network is intentionally NOT persisted — always starts from default ("public")
        // to prevent stale testnet values from localStorage affecting mainnet wallet creation
      }),
    }
  )
);
