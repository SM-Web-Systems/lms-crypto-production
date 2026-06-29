import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { setTokenGetter } from '../services/api';
import { getErrorMessage } from '../utils/apiError';
import { User, LoginResponse, ApiResponse } from '../types/api';
import api from '../services/api';

const TOKEN_KEY = 'lms_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode); auth simply won't persist across reloads.
  }
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Inject the stored JWT into every API request. Reads localStorage on each call
// so the latest token is always used after login/logout.
setTokenGetter(async () => getStoredToken());

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On boot, if we have a token, hydrate the user from /auth/me.
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const token = getStoredToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const response = await api.get<ApiResponse<User>>('/auth/me');
        if (!cancelled && response.data.success && response.data.data) {
          setUser(response.data.data);
        } else if (!cancelled) {
          setStoredToken(null);
        }
      } catch (err) {
        // Expired/invalid token, or server unreachable: drop the session.
        console.error('Failed to restore session:', getErrorMessage(err));
        if (!cancelled) {
          setStoredToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    const data = response.data.data;
    if (!response.data.success || !data) {
      throw new Error(response.data.error?.message || 'Login failed');
    }
    setStoredToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<User> => {
      const response = await api.post<ApiResponse<LoginResponse>>('/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      const data = response.data.data;
      if (!response.data.success || !data) {
        throw new Error(response.data.error?.message || 'Registration failed');
      }
      setStoredToken(data.token);
      setUser(data.user);
      return data.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Stateless logout; ignore network/401 errors.
    }
    setStoredToken(null);
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
