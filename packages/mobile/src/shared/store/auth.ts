import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useWalletStore } from "./wallet";
import { authApi } from "../lib/api";

const API_BASE = "https://ammawallet.com";

export interface UserProfile {
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
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  pinHash: string | null;
  hasPin: boolean;
  isLocked: boolean;

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
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  refreshSession: () => Promise<boolean>;

  setPin: (pin: string) => void;
  verifyPin: (pin: string) => boolean;
  lock: () => void;
  unlock: (pin: string) => boolean;
  clearPin: () => void;

  signingMode?: "self" | "delegated";
}

function hashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const str = pin + "amma-wallet-pin-salt" + pin;
  let hash2 = 0;
  for (let i = 0; i < str.length; i++) {
    hash2 = ((hash2 << 5) - hash2 + str.charCodeAt(i)) | 0;
  }
  return `${hash.toString(36)}-${hash2.toString(36)}`;
}

async function apiRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Detect if identifier is a phone number (starts with +) or email
function isPhoneNumber(identifier: string): boolean {
  return identifier.startsWith("+");
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      pinHash: null,
      hasPin: false,
      isLocked: true,

      register: async (data) => {
        const res = await apiRequest("/api/v1/auth/register", {
          method: "POST",
          body: JSON.stringify(data),
        });
        set({
          user: res.user,
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          isAuthenticated: true,
          isLocked: false,
        });
      },

      login: async (identifier, password, twoFaToken) => {
        const body: Record<string, string> = { password };

        if (isPhoneNumber(identifier)) {
          body.phoneNumber = identifier;
        } else {
          body.email = identifier;
        }

        if (twoFaToken) {
          body.twoFaToken = twoFaToken;
        }

        const data = await apiRequest("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify(body),
        });

        // If 2FA is required, return the response so the UI can prompt
        if (data.twoFaRequired) {
          return data;
        }

        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
          isLocked: get().hasPin,
        });

        // Sync wallets from server
        await useWalletStore.getState().syncFromServer(data.accessToken);

        return data;
      },

      logout: async () => {
        const { refreshToken } = get();
        try {
          if (refreshToken) {
            await apiRequest("/api/v1/auth/logout", {
              method: "POST",
              body: JSON.stringify({ refreshToken }),
            });
          }
        } catch {}
        useWalletStore.getState().logout();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          pinHash: null,
          hasPin: false,
          isLocked: true,
        });
      },

      loadProfile: async () => {
        const { accessToken, refreshSession } = get();
        if (!accessToken) return;

        try {
          const data = await apiRequest("/api/v1/auth/me", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          let signingMode: "self" | "delegated" = "self";
          try {
            const modeRes = await apiRequest("/api/v1/user/signing-mode", {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            signingMode = modeRes.signingMode || "self";
          } catch {}
          set({ user: data, isAuthenticated: true, signingMode });
          await useWalletStore.getState().syncFromServer(accessToken);
        } catch {
          const refreshed = await refreshSession();
          if (refreshed) {
            try {
              const token = get().accessToken!;
              const data = await apiRequest("/api/v1/auth/me", {
                headers: { Authorization: `Bearer ${token}` },
              });
              let signingMode: "self" | "delegated" = "self";
              try {
                const modeRes = await apiRequest("/api/v1/user/signing-mode", {
                  headers: { Authorization: `Bearer ${token}` },
                });
                signingMode = modeRes.signingMode || "self";
              } catch {}
              set({ user: data, isAuthenticated: true, signingMode });
              await useWalletStore.getState().syncFromServer(token);
            } catch {
              set({ isAuthenticated: false, accessToken: null, refreshToken: null, user: null });
            }
          }
        }
      },

      updateProfile: async (updates) => {
        const { accessToken } = get();
        const data = await apiRequest("/api/v1/auth/profile", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(updates),
        });
        set({ user: { ...get().user!, ...data } });
      },

      refreshSession: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          const data = await apiRequest("/api/v1/auth/refresh", {
            method: "POST",
            body: JSON.stringify({ refreshToken }),
          });
          set({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          });
          return true;
        } catch {
          set({
            isAuthenticated: false,
            accessToken: null,
            refreshToken: null,
            user: null,
          });
          return false;
        }
      },

      setPin: (pin) => {
        set({ pinHash: hashPin(pin), hasPin: true, isLocked: false });
      },

      verifyPin: (pin) => {
        return hashPin(pin) === get().pinHash;
      },

      lock: () => {
        set({ isLocked: true });
      },

      unlock: (pin) => {
        if (hashPin(pin) === get().pinHash) {
          set({ isLocked: false });
          return true;
        }
        return false;
      },

      clearPin: () => {
        set({ pinHash: null, hasPin: false, isLocked: false });
      },
    }),
    {
      name: "amma-wallet-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        pinHash: state.pinHash,
        hasPin: state.hasPin,
        isLocked: state.isLocked,
        signingMode: state.signingMode,
      }),
    }
  )
);
