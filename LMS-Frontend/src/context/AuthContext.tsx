import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import api, { onUnauthorized, setTokenGetter } from '../services/api';
import { currentSessionUser } from '../utils/rolePresentation';
import { getErrorMessage, ApiRequestError } from '../utils/apiError';
import { User, LoginResponse, ApiResponse } from '../types/api';
import { resyncWebPush } from '../lib/webPush';
import { forgetSsoReturn } from '../utils/ssoReturn';

// The sign-in token lives in an HttpOnly cookie set by the API; page scripts never see it.
// The browser keeps only a random, non-secret session marker. It says "a sign-in may exist" (so a
// signed-out visitor does not call /auth/me) and changes on every sign-in, so in-flight work can
// tell that the session changed. LEGACY_TOKEN_KEY is read once to migrate older browsers.
const MARKER_KEY = 'lms_session_marker';
const LEGACY_TOKEN_KEY = 'lms_token';
let storageFallback: string | null | undefined;
function newMarker(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
/** The current session marker (not a credential), or null when signed out. */
export function getStoredToken(): string | null {
  if (storageFallback !== undefined) return storageFallback;
  try { return localStorage.getItem(MARKER_KEY); } catch { return null; }
}
function setStoredToken(marker: string | null): void {
  try {
    if(marker) localStorage.setItem(MARKER_KEY,marker); else localStorage.removeItem(MARKER_KEY);
    storageFallback=undefined;
  } catch { storageFallback=marker; }
}
function takeLegacyToken(): string | null {
  try {
    const token = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (token) localStorage.removeItem(LEGACY_TOKEN_KEY);
    return token;
  } catch { return null; }
}
/** Move a bearer token into the HttpOnly cookie. Resolves false only when the token is refused (401). */
async function adoptToken(token: string): Promise<boolean> {
  try {
    await api.post('/auth/session', undefined, { headers: { Authorization: `Bearer ${token}` } });
    return true;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return false;
    throw error;
  }
}
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  completeSso: (token: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User, verifiedToken?: string) => void;
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
// api.ts tags each request with the session marker current when it was sent, so a late 401 from an
// earlier session cannot sign out a newer one.
setTokenGetter(async()=>getStoredToken());

export const AuthProvider: React.FC<{children:ReactNode}> = ({children}) => {
  const [user,setUser]=useState<User|null>(null);
  const [isLoading,setIsLoading]=useState(true);
  const [sessionError,setSessionError]=useState<string|null>(null);
  const generation=useRef(0), request=useRef(0), mounted=useRef(true);
  const invalidate=useCallback((token:string)=>{
    if(!mounted.current || token!==getStoredToken())return;
    generation.current++;request.current++;setStoredToken(null);setUser(null);setSessionError(null);setIsLoading(false);
  },[]);
  const refresh=useCallback(async()=>{
    const legacy=takeLegacyToken();
    if(legacy){
      // One-time migration: a token saved by an older version moves into the HttpOnly cookie.
      try{ if(await adoptToken(legacy)) setStoredToken(newMarker()); }
      catch{
        // Offline or server error: keep the old token for the next attempt and show the reconnect screen.
        try{localStorage.setItem(LEGACY_TOKEN_KEY,legacy);}catch{/* storage unavailable */}
        if(mounted.current){setSessionError('Could not reach the server. Your saved session is being kept.');setIsLoading(false);}
        return;
      }
    }
    const started=generation.current, ticket=++request.current, token=getStoredToken();
    const current=()=>mounted.current && started===generation.current && ticket===request.current && token===getStoredToken();
    if(!token){if(current()){setUser(null);setSessionError(null);setIsLoading(false);}return;}
    try{
      const response=await api.get<ApiResponse<User>>('/auth/me');
      if(!response.data.success || !response.data.data)throw new Error('Could not verify your saved session. Please retry.');
      if(current()){setUser(currentSessionUser(response.data.data));setSessionError(null);}
    }catch(error){
      if(!current())return;
      if(error instanceof ApiRequestError && error.status===401)invalidate(token);
      else setSessionError(getErrorMessage(error,'Could not reach the server. Your saved session is being kept.'));
    }finally{if(current())setIsLoading(false);}
  },[invalidate]);
  useEffect(()=>{
    mounted.current=true;
    const unsubscribe=onUnauthorized(invalidate);
    void refresh();
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',onVisible);
    const timer=window.setInterval(onVisible,60_000);
    return()=>{mounted.current=false;request.current++;unsubscribe();window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',onVisible);};
  },[invalidate,refresh]);
  const establish=useCallback(async(path:string,body:object):Promise<User>=>{
    const started=++generation.current;request.current++;
    const response=await api.post<ApiResponse<LoginResponse>>(path,body);
    const data=response.data.data;
    if(!response.data.success || !data)throw new Error(response.data.error?.message || 'Sign-in failed');
    if(!mounted.current || started!==generation.current)throw new Error('Sign-in was cancelled. Please try again.');
    // The API set the HttpOnly cookie; the token in the body is for native clients and is not kept.
    setStoredToken(newMarker());setUser(currentSessionUser(data.user));setSessionError(null);setIsLoading(false);
    return currentSessionUser(data.user);
  },[]);
  const login=useCallback((email:string,password:string)=>establish('/auth/login',{email:email.trim().toLowerCase(),password}),[establish]);
  const register=useCallback((name:string,email:string,password:string)=>establish('/auth/register',{name:name.trim(),email:email.trim().toLowerCase(),password}),[establish]);
  const completeSso=useCallback(async(token:string):Promise<User>=>{
    const started=++generation.current;request.current++;
    const marker=newMarker();
    setStoredToken(marker);setUser(null);setSessionError(null);setIsLoading(true);
    const current=()=>mounted.current && generation.current===started && getStoredToken()===marker;
    try{
      if(!await adoptToken(token))throw new ApiRequestError({message:'This session has expired or was revoked. Please sign in again.',status:401});
      if(!current())throw new Error('The active session changed. Please sign in again.');
      const response=await api.get<ApiResponse<User>>('/auth/me');
      if(!current())throw new Error('The active session changed. Please sign in again.');
      if(!response.data.success || !response.data.data)throw new Error('Could not verify your wallet session. Please retry.');
      setUser(currentSessionUser(response.data.data));setSessionError(null);
      return currentSessionUser(response.data.data);
    }catch(error){
      if(current()){
        if(error instanceof ApiRequestError && error.status===401)invalidate(marker);
        else setSessionError(getErrorMessage(error,'Could not reach the server. Your wallet session is being kept.'));
      }
      throw error;
    }finally{if(current())setIsLoading(false);}
  },[invalidate]);
  const logout=useCallback(async()=>{
    forgetSsoReturn();
    const token=getStoredToken();generation.current++;request.current++;setStoredToken(null);setUser(null);setSessionError(null);setIsLoading(false);
    // The API revokes the session and clears the cookie. Local sign-out succeeds while offline.
    if(token){try{await api.post('/auth/logout',undefined,{timeout:5000});}catch{/* offline */}}
  },[]);
  const renderedGeneration=generation.current;
  const updateUser=useCallback((updated:User,verifiedToken?:string)=>{
    if(!mounted.current || generation.current!==renderedGeneration)return;
    if(verifiedToken){
      if(verifiedToken!==getStoredToken())return;
      generation.current++;request.current++;setUser(currentSessionUser(updated));setSessionError(null);setIsLoading(false);
    }else setUser(current=>current?.id===updated.id?{...current,name:updated.name}:current);
  },[renderedGeneration]);
  // Each app open renews this device's push binding to the current sign-in (never prompts).
  const userId=user?.id;
  useEffect(()=>{if(userId)void resyncWebPush();},[userId]);
  const recovery=sessionError && !user && !isLoading;
  return <AuthContext.Provider value={{user,isAuthenticated:!!user,isLoading,login,register,completeSso,logout,updateUser}}>
    {recovery ? <main className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
        <h1 className="text-xl font-bold">Reconnect to your account</h1>
        <p>Your saved session is being kept. Reconnect to verify your access and continue.</p>
        <p role="alert">{sessionError}</p>
        <button className="rounded-lg bg-accent-teal px-4 py-2 text-white" onClick={()=>{void refresh();}}>Try again</button>
        <button className="ml-3 rounded-lg border px-4 py-2" onClick={()=>{void logout();}}>Sign out</button>
      </div>
    </main> : <>
      {sessionError && user ? <div role="status" className="bg-amber-50 p-3 text-amber-900">{sessionError} <button onClick={()=>{void refresh();}} className="underline">Retry connection</button></div> : null}
      {children}
    </>}
  </AuthContext.Provider>;
};
