import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, setTokens, clearTokens, getAccessToken, userWalletApi, signingApi } from "../lib/api";
import { useWalletStore } from "./wallet";

export interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  preferredLanguage: string;
  preferredNetwork: string;
  isEmailVerified?: boolean;
}

export interface ServerWallet {
  id: number;
  name: string;
  publicKey: string;
  network: string;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  serverWallets: ServerWallet[];
  signingMode: "self" | "delegated";

  register: (email: string, password: string, firstName?: string, lastName?: string, turnstileToken?: string) => Promise<void>;
  login: (email: string, password: string, turnstileToken?: string, twoFaToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  loadProfile: () => Promise<void>;
  updateProfile: (data: { firstName?: string; lastName?: string; preferredLanguage?: string; preferredNetwork?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  loadWallets: () => Promise<void>;
  addWallet: (data: { name: string; publicKey: string; encryptedSecret?: string; network?: string }) => Promise<void>;
  activateWallet: (id: number) => Promise<void>;
  renameWallet: (id: number, name: string) => Promise<void>;
  removeWallet: (id: number) => Promise<void>;
}

async function fetchSigningMode(): Promise<"self" | "delegated"> {
  try {
    const mode = await signingApi.getMode();
    return mode;
  } catch {
    return "self";
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      serverWallets: [],
      signingMode: "self",

      register: async (email, password, firstName, lastName, turnstileToken) => {
        set({ isLoading: true });
        try {
          const res = await authApi.register({ email, password, firstName, lastName, turnstileToken });
          setTokens(res.accessToken, res.refreshToken);
          set({
            user: res.user,
            isAuthenticated: true,
            isLoading: false,
            signingMode: "self",
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      login: async (email, password, turnstileToken, twoFaToken?) => {
        set({ isLoading: true });
        try {
          const res = await authApi.login({ email, password, turnstileToken, twoFaToken });

          // If 2FA is required, throw so the UI can prompt for the code
          if (res.twoFaRequired) {
            set({ isLoading: false });
            throw new Error("2FA_REQUIRED:" + (res.twoFaMethod || "totp"));
          }

          setTokens(res.accessToken, res.refreshToken);
          const mode = await fetchSigningMode();
          set({
            user: res.user,
            isAuthenticated: true,
            isLoading: false,
            signingMode: mode,
          });
          await get().loadWallets();
          await useWalletStore.getState().syncFromServer();
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {}
        clearTokens();
        useWalletStore.getState().logout();
        set({
          user: null,
          isAuthenticated: false,
          serverWallets: [],
          signingMode: "self",
        });
      },

      loadProfile: async () => {
        if (!getAccessToken()) {
          set({ user: null, isAuthenticated: false, serverWallets: [], signingMode: "self" });
          return;
        }
        try {
          const res = await authApi.me();
          const mode = await fetchSigningMode();
          set({
            user: res.user,
            isAuthenticated: true,
            serverWallets: res.wallets || [],
            signingMode: mode,
          });
          await useWalletStore.getState().syncFromServer();
        } catch {
          clearTokens();
          set({ user: null, isAuthenticated: false, serverWallets: [], signingMode: "self" });
        }
      },

      updateProfile: async (data) => {
        const res = await authApi.updateProfile(data);
        // Check if 2FA is required
        if ((res as any).twoFaRequired) {
          throw new Error("2FA_REQUIRED:" + (res.twoFaMethod || "totp"));
        }
        set({ user: res.user });
      },

      changePassword: async (currentPassword, newPassword) => {
        await authApi.changePassword({ currentPassword, newPassword });
      },

      loadWallets: async () => {
        try {
          const wallets = await userWalletApi.list();
          set({ serverWallets: wallets });
        } catch {}
      },

      addWallet: async (data) => {
        await userWalletApi.add(data);
        await get().loadWallets();
      },

      activateWallet: async (id) => {
        await userWalletApi.activate(id);
        await get().loadWallets();
      },

      renameWallet: async (id, name) => {
        await userWalletApi.rename(id, name);
        await get().loadWallets();
      },

      removeWallet: async (id) => {
        await userWalletApi.remove(id);
        await get().loadWallets();
      },
    }),
    {
      name: "amma-wallet-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        serverWallets: state.serverWallets,
        signingMode: state.signingMode,
      }),
    }
  )
);
