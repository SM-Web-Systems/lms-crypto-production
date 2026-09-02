import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { useAuthStore } from "./auth";
import {
  generateMnemonic as genMnemonic,
  keypairFromMnemonic,
  validateMnemonic,
} from "../lib/hd-wallet";

const API_BASE = "https://ammawallet.com";

export interface WalletAccount {
  id: string;
  serverId?: number;
  name: string;
  publicKey: string;
  encryptedSecret: string;
  derivationIndex?: number;
  isHD?: boolean;
}

interface WalletState {
  accounts: WalletAccount[];
  activeAccountId: string | null;
  network: "testnet" | "public";
  isUnlocked: boolean;
  _secretKey: string | null;
  _syncing: boolean;

  createWallet: (name: string, pin: string) => Promise<string>;
  importWallet: (name: string, secretKey: string, pin: string) => Promise<string>;
  switchAccount: (id: string) => void;
  removeAccount: (id: string) => void;
  renameAccount: (id: string, name: string) => void;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  logout: () => void;
  getSecretKey: () => string | null;
  setNetwork: (n: "testnet" | "public") => void;
  syncFromServer: (accessToken: string) => Promise<void>;
  createWalletFromMnemonic: (
    name: string,
    pin: string,
    mnemonic: string,
    accountIndex?: number
  ) => Promise<{ publicKey: string; mnemonic: string }>;
  importFromMnemonic: (
    name: string,
    mnemonic: string,
    pin: string,
    accountIndex?: number
  ) => Promise<string>;
  generateMnemonic: () => string;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getToken(): string | null {
  return useAuthStore.getState().accessToken;
}

async function serverRequest(path: string, options: RequestInit = {}) {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers as Record<string, string>),
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function generateKeypair(): Promise<{ publicKey: string; secretKey: string }> {
  const res = await fetch(`${API_BASE}/api/v1/keypair/generate`);
  if (!res.ok) throw new Error("Failed to generate keypair");
  return res.json();
}

async function publicKeyFromSecret(secret: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/keypair/from-secret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  if (!res.ok) throw new Error("Invalid secret key");
  const data = await res.json();
  return data.publicKey;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,
      network: "testnet",
      isUnlocked: false,
      _secretKey: null,
      _syncing: false,

      syncFromServer: async (accessToken: string) => {
        if (get()._syncing) return;
        set({ _syncing: true });
        try {
          const res = await fetch(`${API_BASE}/api/v1/wallets`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) { set({ _syncing: false }); return; }
          const serverWallets = await res.json();
          if (!serverWallets || serverWallets.length === 0) {
            set({ _syncing: false });
            return;
          }

          const localAccounts = get().accounts;
          const merged: WalletAccount[] = [];
          const seenPubkeys = new Set<string>();

          for (const local of localAccounts) {
            const serverMatch = serverWallets.find((sw: any) => sw.publicKey === local.publicKey);
            merged.push({
              ...local,
              serverId: serverMatch?.id ?? local.serverId,
            });
            seenPubkeys.add(local.publicKey);
          }

          for (const sw of serverWallets) {
            if (!seenPubkeys.has(sw.publicKey)) {
              if (sw.encryptedSecret) {
                const storeKey = `secret_${sw.publicKey}`;
                await SecureStore.setItemAsync(storeKey, sw.encryptedSecret);
              }
              merged.push({
                id: generateId(),
                serverId: sw.id,
                name: sw.name,
                publicKey: sw.publicKey,
                encryptedSecret: `secret_${sw.publicKey}`,
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

          set({ accounts: merged, activeAccountId: newActiveId, _syncing: false });
        } catch (err) {
          console.error("Wallet sync failed:", err);
          set({ _syncing: false });
        }
      },

      createWallet: async (name: string, _pin: string) => {
        const trimmedName = (name || `Wallet ${get().accounts.length + 1}`).trim();
        if (get().accounts.some((a) => a.name.toLowerCase() === trimmedName.toLowerCase())) {
          throw new Error("A wallet with this name already exists");
        }

        const { publicKey, secretKey } = await generateKeypair();

        const storeKey = `secret_${publicKey}`;
        await SecureStore.setItemAsync(storeKey, secretKey);

        // Sync to server FIRST
        let serverId: number | undefined;
        try {
          const serverWallet = await serverRequest("/api/v1/wallets", {
            method: "POST",
            body: JSON.stringify({
              name: trimmedName,
              publicKey,
              encryptedSecret: secretKey,
              network: get().network,
            }),
          });
          serverId = serverWallet?.id;
        } catch {}

        if (get().network === "testnet") {
          try {
            await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
          } catch {}
        }

        const account: WalletAccount = {
          id: generateId(),
          serverId,
          name: trimmedName,
          publicKey,
          encryptedSecret: storeKey,
        };

        set((s) => ({
          accounts: [...s.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
        }));

        return publicKey;
      },

      importWallet: async (name: string, secretKey: string, _pin: string) => {
        const trimmedName = (name || `Imported ${get().accounts.length + 1}`).trim();
        if (get().accounts.some((a) => a.name.toLowerCase() === trimmedName.toLowerCase())) {
          throw new Error("A wallet with this name already exists");
        }

        const publicKey = await publicKeyFromSecret(secretKey);

        const existing = get().accounts.find((a) => a.publicKey === publicKey);
        if (existing) throw new Error("Wallet already exists");

        const storeKey = `secret_${publicKey}`;
        await SecureStore.setItemAsync(storeKey, secretKey);

        // Sync to server FIRST
        let serverId: number | undefined;
        try {
          const serverWallet = await serverRequest("/api/v1/wallets", {
            method: "POST",
            body: JSON.stringify({
              name: trimmedName,
              publicKey,
              encryptedSecret: secretKey,
              network: get().network,
            }),
          });
          serverId = serverWallet?.id;
        } catch {}

        const account: WalletAccount = {
          id: generateId(),
          serverId,
          name: trimmedName,
          publicKey,
          encryptedSecret: storeKey,
        };

        set((s) => ({
          accounts: [...s.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
        }));

        return publicKey;
      },

      switchAccount: (id) => {
        const account = get().accounts.find((a) => a.id === id);
        if (account?.serverId) {
          serverRequest(`/api/v1/wallets/${account.serverId}/activate`, {
            method: "PATCH",
            body: JSON.stringify({}),
          }).catch(console.error);
        }
        set({ activeAccountId: id, isUnlocked: false, _secretKey: null });
      },

      removeAccount: (id) => {
        const account = get().accounts.find((a) => a.id === id);
        if (account?.serverId) {
          serverRequest(`/api/v1/wallets/${account.serverId}`, {
            method: "DELETE",
          }).catch(console.error);
        }
        set((s) => {
          const accounts = s.accounts.filter((a) => a.id !== id);
          return {
            accounts,
            activeAccountId: accounts.length > 0 ? accounts[0].id : null,
            isUnlocked: false,
            _secretKey: null,
          };
        });
      },

      renameAccount: (id, name) => {
        const account = get().accounts.find((a) => a.id === id);
        if (account?.serverId) {
          serverRequest(`/api/v1/wallets/${account.serverId}`, {
            method: "PATCH",
            body: JSON.stringify({ name }),
          }).catch(console.error);
        }
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, name } : a)),
        }));
      },

      unlock: async (_pin: string) => {
        const active = get().accounts.find((a) => a.id === get().activeAccountId);
        if (!active) throw new Error("No active account");
        const secret = await SecureStore.getItemAsync(active.encryptedSecret);
        if (!secret) throw new Error("Invalid PIN");
        set({ isUnlocked: true, _secretKey: secret });
      },

      lock: () => set({ isUnlocked: false, _secretKey: null }),
      logout: () => set({ accounts: [], activeAccountId: null, isUnlocked: false, _secretKey: null }),
      getSecretKey: () => get()._secretKey,
      setNetwork: (n) => set({ network: n }),

      // ─── NEW: the three methods above go here ───
      generateMnemonic: () => {
        return genMnemonic();
      },

      // ─── Create wallet from a 24-word mnemonic ───
      createWalletFromMnemonic: async (
        name: string,
        _pin: string,
        mnemonic: string,
        accountIndex: number = 0
      ) => {
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

        if (!validateMnemonic(mnemonic)) {
          throw new Error("Invalid mnemonic phrase");
        }

        const { publicKey, secretKey } = keypairFromMnemonic(
          mnemonic,
          accountIndex
        );

        if (get().accounts.some((a) => a.publicKey === publicKey)) {
          throw new Error("This wallet already exists");
        }

        const storeKey = `secret_${publicKey}`;
        await SecureStore.setItemAsync(storeKey, secretKey);

        // Store mnemonic securely
        const mnemonicKey = `mnemonic_${publicKey}`;
        await SecureStore.setItemAsync(mnemonicKey, mnemonic.trim());

        // Sync to server
        let serverId: number | undefined;
        try {
          const serverWallet = await serverRequest("/api/v1/wallets", {
            method: "POST",
            body: JSON.stringify({
              name: trimmedName,
              publicKey,
              encryptedSecret: secretKey,
              network: get().network,
            }),
          });
          serverId = serverWallet?.id;
        } catch {}

        // Fund on testnet
        if (get().network === "testnet") {
          try {
            await fetch(
              `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
            );
          } catch {}
        }

        const account: WalletAccount = {
          id: generateId(),
          serverId,
          name: trimmedName,
          publicKey,
          encryptedSecret: storeKey,
          derivationIndex: accountIndex,
          isHD: true,
        };

        set((s) => ({
          accounts: [...s.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
        }));

        return { publicKey, mnemonic: mnemonic.trim() };
      },

      // ─── Import from mnemonic ───
      importFromMnemonic: async (
        name: string,
        mnemonic: string,
        _pin: string,
        accountIndex: number = 0
      ) => {
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

        if (!validateMnemonic(mnemonic)) {
          throw new Error("Invalid mnemonic phrase. Check your words.");
        }

        const { publicKey, secretKey } = keypairFromMnemonic(
          mnemonic,
          accountIndex
        );

        if (get().accounts.some((a) => a.publicKey === publicKey)) {
          throw new Error("Wallet already exists");
        }

        const storeKey = `secret_${publicKey}`;
        await SecureStore.setItemAsync(storeKey, secretKey);

        const mnemonicKey = `mnemonic_${publicKey}`;
        await SecureStore.setItemAsync(mnemonicKey, mnemonic.trim());

        let serverId: number | undefined;
        try {
          const serverWallet = await serverRequest("/api/v1/wallets", {
            method: "POST",
            body: JSON.stringify({
              name: trimmedName,
              publicKey,
              encryptedSecret: secretKey,
              network: get().network,
            }),
          });
          serverId = serverWallet?.id;
        } catch {}

        const account: WalletAccount = {
          id: generateId(),
          serverId,
          name: trimmedName,
          publicKey,
          encryptedSecret: storeKey,
          derivationIndex: accountIndex,
          isHD: true,
        };

        set((s) => ({
          accounts: [...s.accounts, account],
          activeAccountId: account.id,
          isUnlocked: true,
          _secretKey: secretKey,
        }));

        return publicKey;
      },
    }),
    {
      name: "amma-wallet-mobile",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
        network: state.network,
      }),
    }
  )
);
