import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import api, { setTokenGetter, onUnauthorized } from '../lib/api';
import { getErrorMessage, ApiRequestError } from '../utils/apiError';
import { authService } from '../services/authService';
import { ammaWalletService } from '../services/ammaWalletService';
import { setPushSession } from '../services/pushNotifications';
import { setOfflineSession } from '../services/offlineLearningNative';
import { getStoredToken, setStoredToken, clearStoredToken } from '../lib/token';
import { canStudy } from '../utils/authorization';
import { currentSessionUser } from '../../../LMS-Frontend/src/utils/rolePresentation';
import type { User } from '../types/api';

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionError: string | null;
  sessionNotice: string | null;
  storageWarning: string | null;
  walletSignInPending: boolean;
  loginWithAmma: () => Promise<User>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  refresh: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
setTokenGetter(getStoredToken);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionNotice, setNotice] = useState<string | null>(null);
  const [storageWarning, setWarning] = useState<string | null>(null);
  const [walletSignInPending,setWalletPending] = useState(false);
  const walletPending = useRef(false);
  const walletRequest = useRef(0);
  const generation = useRef(0);
  const request = useRef(0);
  const mounted = useRef(true);

  const expire = useCallback(async (token: string) => {
    const started = generation.current;
    if (await getStoredToken().catch(() => null) !== token || started !== generation.current || !mounted.current) return;
    generation.current++; request.current++;
    const pushCleanup = setPushSession(null);
    const offlineCleanup = setOfflineSession(null);
    setUser(null); setSessionError(null); setIsLoading(false);
    setNotice('Your session expired or was revoked. Please sign in again.');
    await clearStoredToken().catch(() => setWarning('This device could not remove the saved session. Please retry signing out.'));
    if (!await pushCleanup && generation.current === started + 1 && mounted.current) {
      setWarning(current => current ?? 'This device could not save notification cleanup. Reopen the app when connected to retry.');
    }
    if (!await offlineCleanup && generation.current === started + 1 && mounted.current) {
      setWarning(current => current ?? 'This device could not erase saved lessons. Retry signing out to clear them.');
    }
  }, []);

  const refresh = useCallback(async () => {
    if (walletPending.current) return; // Browser foregrounding must not hydrate the previous identity.
    const started = generation.current;
    const currentRequest = ++request.current;
    const current = () => mounted.current && generation.current === started && request.current === currentRequest;
    let token: string | null = null;
    try {
      token = await getStoredToken();
      if (!current()) return;
      if (!token) { void setPushSession(null); void setOfflineSession(null); setUser(null); setSessionError(null); return; }
      const me = await authService.getMe();
      if (current()) {
        const user = currentSessionUser(me);
        void setPushSession(me.deletionStatus === 'pending_deletion' ? null : me.id, token);
        void setOfflineSession(canStudy(user) && user.deletionStatus !== 'pending_deletion' ? token : null, true);
        setUser(user); setSessionError(null);
      }
    } catch (error) {
      if (!current()) return;
      if (token && error instanceof ApiRequestError && error.status === 401) await expire(token);
      else {
        const disconnected = error instanceof ApiRequestError && (error.status == null || error.status >= 500);
        void setOfflineSession(disconnected ? token : null);
        setSessionError(getErrorMessage(error, 'Could not restore your session. Check your connection and try again.'));
      }
    } finally { if (current()) setIsLoading(false); }
  }, [expire]);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = onUnauthorized((token) => { void expire(token); });
    void refresh();
    const app = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60_000);
    return () => { mounted.current = false; request.current++; ammaWalletService.cancelSignIn(); unsubscribe(); app.remove(); clearInterval(timer); };
  }, [expire, refresh]);

  // While a reconnect notice is showing, check more often so it clears soon after the connection
  // returns instead of waiting for the next one-minute refresh.
  useEffect(() => {
    if (!sessionError) return;
    const retry = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 10_000);
    return () => clearInterval(retry);
  }, [sessionError, refresh]);

  const establish = useCallback(async (work: () => Promise<{token: string; user: User}>): Promise<User> => {
    const started = ++generation.current; request.current++;
    const result = await work();
    if (!mounted.current || generation.current !== started) throw new Error('Sign-in was cancelled. Please try again.');
    void setPushSession(null);
    void setOfflineSession(null);
    const persisted = await setStoredToken(result.token);
    if (!mounted.current || generation.current !== started) throw new Error('Sign-in was cancelled. Please try again.');
    void setPushSession(result.user.deletionStatus === 'pending_deletion' ? null : result.user.id, result.token);
    const user = currentSessionUser(result.user);
    void setOfflineSession(canStudy(user) && user.deletionStatus !== 'pending_deletion' ? result.token : null, true);
    setUser(user); setSessionError(null); setNotice(null); setIsLoading(false);
    setWarning(persisted ? null : 'You are signed in, but this device could not save the session. You may need to sign in again after closing the app.');
    return user;
  }, []);
  const loginWithAmma = useCallback(async () => {
    if (walletPending.current) throw new Error('Wallet sign-in is already in progress.');
    const attempt = ++walletRequest.current;
    walletPending.current = true; setWalletPending(true); setNotice(null);
    try { return await establish(() => ammaWalletService.signIn()); }
    catch (error) {
      if (mounted.current && walletRequest.current === attempt) setNotice(getErrorMessage(error,'Could not complete wallet sign-in. Please try again.'));
      throw error;
    }
    finally { if (mounted.current && walletRequest.current === attempt) { walletPending.current = false; setWalletPending(false); } }
  },[establish]);
  const login = useCallback((email: string, password: string) => {
    walletRequest.current++; walletPending.current = false; setWalletPending(false); ammaWalletService.cancelSignIn();
    return establish(() => authService.login(email,password));
  },[establish]);
  const logout = useCallback(async () => {
    walletRequest.current++; walletPending.current = false; setWalletPending(false); ammaWalletService.cancelSignIn();
    const started = ++generation.current; request.current++;
    const pushCleanup = setPushSession(null);
    const offlineCleanup = setOfflineSession(null);
    const token = await getStoredToken().catch(() => null);
    // A delayed storage lookup can return a newer login's token. Superseded
    // logout work must neither clear local state nor revoke that newer token.
    if (generation.current !== started) return;
    setUser(null); setSessionError(null); setNotice(null); setIsLoading(false); setWarning(null);
    await clearStoredToken().catch(() => {
      if (mounted.current && generation.current === started) setWarning('This device could not remove the saved session. Please retry signing out.');
    });
    if (token) {
      try { await api.post('/auth/logout', undefined, {headers:{Authorization: `Bearer ${token}`},timeout:5000}); }
      catch { /* Local sign-out still succeeds while offline. */ }
    }
    if (!await pushCleanup && mounted.current && generation.current === started) {
      setWarning(current => current ?? 'This device could not save notification cleanup. Reopen the app when connected to retry.');
    }
    if (!await offlineCleanup && mounted.current && generation.current === started) {
      setWarning(current => current ?? 'This device could not erase saved lessons. Retry signing out to clear them.');
    }
  }, []);
  const renderedGeneration = generation.current;
  const updateUser = useCallback((updated: User) => {
    if (generation.current !== renderedGeneration || !mounted.current) return;
    // Profile responses cannot restore a signed-out identity or replace newer authorization.
    setUser(current => current?.id === updated.id ? {...current,name:updated.name} : current);
  }, [renderedGeneration]);
  return <AuthContext.Provider value={{user,isAuthenticated:!!user,isLoading,sessionError,sessionNotice,storageWarning,walletSignInPending,loginWithAmma,login,logout,updateUser,refresh}}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
