import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, signingApi, setTokens, clearTokens, getAccessToken } from "../lib/api";
import { useWalletStore } from "./wallet";

interface User {
  id: number;
  email: string | null;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  preferredLanguage: string;
  preferredNetwork: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  signingMode: "self" | "delegated";

  register: (data: {
    email?: string;
    password: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  login: (identifier: string, password: string, twoFaToken?: string) => Promise<any>;
  logout: () => Promise<void>;
  loadProfile: () => Promise<void>;
  updateProfile: (data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    preferredLanguage?: string;
    preferredNetwork?: string;
  }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

function isPhoneNumber(identifier: string): boolean {
  return identifier.startsWith("+");
}

async function fetchSigningMode(): Promise<"self" | "delegated"> {
  try {
    return await signingApi.getMode();
  } catch {
    return "self";
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      signingMode: "self",

      register: async (data) => {
        const res = await authApi.register(data);
        setTokens(res.accessToken, res.refreshToken);
        set({ user: res.user, isAuthenticated: true });
      },

      login: async (identifier, password, twoFaToken) => {
        const res = await authApi.login(identifier, password, twoFaToken);

        // If 2FA is required, return the response so the UI can prompt
        if (res.twoFaRequired) {
          return res;
        }

        setTokens(res.accessToken, res.refreshToken);
        const signingMode = await fetchSigningMode();
        set({ user: res.user, isAuthenticated: true, signingMode });
        await useWalletStore.getState().syncFromServer();
        return res;
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {}
        clearTokens();
        useWalletStore.getState().logout();
        set({ user: null, isAuthenticated: false, signingMode: "self" });
      },

      loadProfile: async () => {
        const token = getAccessToken();
        if (!token) {
          set({ user: null, isAuthenticated: false, signingMode: "self" });
          return;
        }
        try {
          const res = await authApi.me();
          const signingMode = await fetchSigningMode();
          set({ user: res, isAuthenticated: true, signingMode });
          await useWalletStore.getState().syncFromServer();
        } catch {
          clearTokens();
          set({ user: null, isAuthenticated: false, signingMode: "self" });
        }
      },

      updateProfile: async (data) => {
        const res = await authApi.updateProfile(data);
        set((state) => ({ user: { ...state.user!, ...res } }));
      },

      changePassword: async (currentPassword, newPassword) => {
        await authApi.changePassword(currentPassword, newPassword);
      },
    }),
    {
      name: "stellar-ext-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        signingMode: state.signingMode,
      }),
    }
  )
);
