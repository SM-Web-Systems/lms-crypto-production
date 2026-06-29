import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import api, { setTokenGetter } from '../lib/api';
import { getErrorMessage } from '../utils/apiError';
import { authService } from '../services/authService';
import { getStoredToken, setStoredToken, clearStoredToken } from '../lib/token';
import type { User } from '../types/api';

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Inject the stored JWT into every API request. SecureStore is read on each call
// so the freshest token is always used after login/logout.
setTokenGetter(getStoredToken);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authService.getMe();
      setUser(me);
    } catch (err) {
      console.error('Failed to fetch user profile:', getErrorMessage(err));
      setUser(null);
    }
  }, []);

  // On boot, restore the session if a token is present.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getStoredToken();
      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const me = await authService.getMe();
        if (!cancelled) setUser(me);
      } catch (err) {
        console.error('Failed to restore session:', getErrorMessage(err));
        await clearStoredToken();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const { token, user: loggedIn } = await authService.login(email, password);
    await setStoredToken(token);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<User> => {
      const { token, user: created } = await authService.register(name, email, password);
      await setStoredToken(token);
      setUser(created);
      return created;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Stateless logout; ignore errors.
    }
    await clearStoredToken();
    setUser(null);
  }, []);

  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        updateUser,
        refresh,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
