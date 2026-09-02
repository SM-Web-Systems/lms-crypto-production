import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateKeypair, keypairFromSecret, fundTestnet } from "../lib/stellar";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { userWalletApi, keypairApi } from "../lib/api";

export interface WalletAccount {
  id: string;
  serverId?: number;
  name: string;
  publicKey: string;
  encryptedSecret: string;
  isHD?: boolean;
  derivationIndex?: number;
  createdAt: number;
}

interface WalletState {
  accounts: WalletAccount[];
  activeAccountId: string | null;
  network: "testnet" | "public";
  isUnlocked: boolean;
  _secretKey: string | null;
  _mnemonic: string | null;
  _syncing: boolean;

  getPublicKey: () => string | null;
  activeAccount: () => WalletAccount | null;
  createWallet: (name: string, pin: string) => Promise<string>;
  importWallet: (name: string, secretKey: string, pin: string) => Promise<string>;
  generateMnemonic: () => Promise<string>;
  createWalletFromMnemonic: (
    name: string,
    mnemonic: string,
    pin: string
  ) => Promise<{ publicKey: string; mnemonic: string }>;
  importFromMnemonic: (name: string, mnemonic: string, pin: string) => Promise<string>;
  switchAccount: (accountId: string) => void;
  removeAccount: (accountId: string) => void;
  renameAccount: (accountId: string, newName: string) => void;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  logout: () => void;
  getSecretKey: () => string;
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
      network: "testnet",
      isUnlocked: false,
      _secretKey: null,
      _mnemonic: null,
      _syncing: false,

      getPublicKey: () => {
        const state = get();
        const active = state.accounts.find((a) => a.id === state.activeAccountId);
        return active?.publicKey ?? null;
      },

      activeAccount: () => {
        const state = get();
        return state.accounts.find((a) => a.id === state.activeAccountId) ?? null;
      },

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
              encryptedSecret:
                local.encryptedSecret || serverMatch?.encryptedSecret || "",
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

          if (
            !currentActiveId ||
            !merged.find((m) => m.id === currentActiveId)
          ) {
            if (activeServer) {
              const match = merged.find(
                (m) => m.publicKey === activeServer.publicKey
              );
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

      createWallet: async (name, pin) => {
        const trimmedName = (
          name || `Wallet ${get().accounts.length + 1}`
        ).trim();
        if (
          get().accounts.some(
            (a) => a.name.toLowerCase() === trimmedName.toLowerCase()
          )
        ) {
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

        try {
          await fundTestnet(publicKey);
        } catch {}

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

        return publicKey;
      },

      importWallet: async (name, secretKey, pin) => {
        const trimmedName = (
          name || `Imported ${get().accounts.length + 1}`
        ).trim();
        if (
          get().accounts.some(
            (a) => a.name.toLowerCase() === trimmedName.toLowerCase()
          )
        ) {
          throw new Error("A wallet with this name already exists");
        }

        const { publicKey } = keypairFromSecret(secretKey);

        if (get().accounts.some((a) => a.publicKey === publicKey)) {
          throw new Error("This wallet is already added");
        }

        const encrypted = await encryptSecret(secretKey, pin);

        const account: WalletAccount = {
          id: generateId(),
          name: trimmedName,
          publicKey,
          encryptedSecret: encrypted,
          createdAt: Date.now(),
        };

        try {
          const serverWallet = await userWalletApi.add({
            name: trimmedName,
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

      // ─── Mnemonic support ──────────────────────────────────
      generateMnemonic: async () => {
        const { generateMnemonic: gen } = await import("bip39");
        return gen();
      },

      createWalletFromMnemonic: async (name, mnemonic, pin) => {
        const trimmedName = (
          name || `HD Wallet ${get().accounts.length + 1}`
        ).trim();
        if (
          get().accounts.some(
            (a) => a.name.toLowerCase() === trimmedName.toLowerCase()
          )
        ) {
          throw new Error("A wallet with this name already exists");
        }

        // Derive keypair from mnemonic via backend
        const derived = await keypairApi.fromMnemonic(mnemonic, 0);
        const { publicKey, secretKey } = derived;

        if (get().accounts.some((a) => a.publicKey === publicKey)) {
          throw new Error("This wallet is already added");
        }

        const encrypted = await encryptSecret(secretKey, pin);
        const encryptedMnemonic = await encryptSecret(mnemonic, pin);

        // Store encrypted mnemonic in localStorage
        const accountId = generateId();
        localStorage.setItem(`mnemonic_${accountId}`, encryptedMnemonic);

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

        try {
          await fundTestnet(publicKey);
        } catch {}

        const account: WalletAccount = {
          id: accountId,
          serverId,
          name: trimmedName,
          publicKey,
          encryptedSecret: encrypted,
          isHD: true,
          derivationIndex: 0,
          createdAt: Date.now(),
        };

        set((state) => ({
          accounts: [...state.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
          _mnemonic: mnemonic,
        }));

        return { publicKey, mnemonic };
      },

      importFromMnemonic: async (name, mnemonic, pin) => {
        const trimmedName = (
          name || `Recovered ${get().accounts.length + 1}`
        ).trim();
        if (
          get().accounts.some(
            (a) => a.name.toLowerCase() === trimmedName.toLowerCase()
          )
        ) {
          throw new Error("A wallet with this name already exists");
        }

        // Validate and derive via backend
        const validation = await keypairApi.validateMnemonic(mnemonic);
        if (!validation.valid) {
          throw new Error("Invalid recovery phrase");
        }

        const derived = await keypairApi.fromMnemonic(mnemonic, 0);
        const { publicKey, secretKey } = derived;

        if (get().accounts.some((a) => a.publicKey === publicKey)) {
          throw new Error("This wallet is already added");
        }

        const encrypted = await encryptSecret(secretKey, pin);
        const encryptedMnemonic = await encryptSecret(mnemonic, pin);

        const accountId = generateId();
        localStorage.setItem(`mnemonic_${accountId}`, encryptedMnemonic);

        const account: WalletAccount = {
          id: accountId,
          name: trimmedName,
          publicKey,
          encryptedSecret: encrypted,
          isHD: true,
          derivationIndex: 0,
          createdAt: Date.now(),
        };

        try {
          const serverWallet = await userWalletApi.add({
            name: trimmedName,
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
          _mnemonic: mnemonic,
        }));

        return publicKey;
      },

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

      removeAccount: (accountId) => {
        const { accounts, activeAccountId } = get();
        const account = accounts.find((a) => a.id === accountId);
        if (account?.serverId) {
          userWalletApi.remove(account.serverId).catch(console.error);
        }
        // Clean up mnemonic
        localStorage.removeItem(`mnemonic_${accountId}`);

        const remaining = accounts.filter((a) => a.id !== accountId);
        let newActiveId = activeAccountId;
        if (activeAccountId === accountId) {
          newActiveId = remaining.length > 0 ? remaining[0].id : null;
        }
        set({
          accounts: remaining,
          activeAccountId: newActiveId,
          isUnlocked: false,
          _secretKey: null,
          _mnemonic: null,
        });
      },

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

      unlock: async (pin) => {
        const account = get().activeAccount();
        if (!account) throw new Error("No active account");
        const secretKey = await decryptSecret(account.encryptedSecret, pin);

        // Also decrypt mnemonic if HD wallet
        let mnemonic: string | null = null;
        if (account.isHD) {
          const encryptedMnemonic = localStorage.getItem(
            `mnemonic_${account.id}`
          );
          if (encryptedMnemonic) {
            try {
              mnemonic = await decryptSecret(encryptedMnemonic, pin);
            } catch {
              // Mnemonic decrypt failed, not critical
            }
          }
        }

        set({ isUnlocked: true, _secretKey: secretKey, _mnemonic: mnemonic });
      },

      lock: () =>
        set({ isUnlocked: false, _secretKey: null, _mnemonic: null }),

      logout: () => {
        // Clean up all mnemonic entries
        const accounts = get().accounts;
        for (const account of accounts) {
          localStorage.removeItem(`mnemonic_${account.id}`);
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

      setNetwork: (n) => set({ network: n }),
    }),
    {
      name: "amma-wallet",
      partialize: (state) => ({
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
        network: state.network,
      }),
    }
  )
);
