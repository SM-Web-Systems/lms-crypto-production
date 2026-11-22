import React, { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import api, { onUnauthorized, setTokenGetter } from '../services/api';
import { currentSessionUser } from '../utils/rolePresentation';
import { getErrorMessage, ApiRequestError } from '../utils/apiError';
import { User, LoginResponse, ApiResponse } from '../types/api';
import { resyncWebPush } from '../lib/webPush';
import { forgetSsoReturn } from '../utils/ssoReturn';
import { useGeneration } from '../hooks/useGeneration';
import { AuthContext, LEGACY_TOKEN_KEY, getStoredToken, newMarker, setStoredToken, takeLegacyToken } from './authSession';

// Registered here, not in authSession.ts, so modules that only read the marker do not need the API client.
// api.ts tags each request with the session marker current when it was sent, so a late 401 from an
// earlier session cannot sign out a newer one.
setTokenGetter(async()=>getStoredToken());

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

export const AuthProvider: React.FC<{children:ReactNode}> = ({children}) => {
  const [user,setUser]=useState<User|null>(null);
  const [isLoading,setIsLoading]=useState(true);
  const [sessionError,setSessionError]=useState<string|null>(null);
  const generation=useRef(0), request=useGeneration(), mounted=useRef(true);
  // Counts wallet sign-ins in flight. The callback's effect runs before this provider's mount effect, and a
  // background check sent before POST /auth/session sets the cookie gets a 401 that would wipe the new sign-in.
  const ssoPending=useRef(0);
  const invalidate=useCallback((token:string)=>{
    if(!mounted.current || token!==getStoredToken())return;
    generation.current++;request.next();setStoredToken(null);setUser(null);setSessionError(null);setIsLoading(false);
  },[request]);
  const refresh=useCallback(async()=>{
    if(ssoPending.current)return; // completeSso verifies the new session itself.
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
    const started=generation.current, ticket=request.next(), token=getStoredToken();
    const current=()=>mounted.current && started===generation.current && request.isCurrent(ticket) && token===getStoredToken();
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
  },[invalidate,request]);
  useEffect(()=>{
    mounted.current=true;
    const unsubscribe=onUnauthorized(invalidate);
    void refresh();
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',onVisible);
    const timer=window.setInterval(onVisible,60_000);
    return()=>{mounted.current=false;request.next();unsubscribe();window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',onVisible);};
  },[invalidate,refresh,request]);
  const establish=useCallback(async(path:string,body:object):Promise<User>=>{
    const started=++generation.current;request.next();
    const response=await api.post<ApiResponse<LoginResponse>>(path,body);
    const data=response.data.data;
    if(!response.data.success || !data)throw new Error(response.data.error?.message || 'Sign-in failed');
    if(!mounted.current || started!==generation.current)throw new Error('Sign-in was cancelled. Please try again.');
    // The API set the HttpOnly cookie; the token in the body is for native clients and is not kept.
    setStoredToken(newMarker());setUser(currentSessionUser(data.user));setSessionError(null);setIsLoading(false);
    return currentSessionUser(data.user);
  },[request]);
  const login=useCallback((email:string,password:string)=>establish('/auth/login',{email:email.trim().toLowerCase(),password}),[establish]);
  const register=useCallback((name:string,email:string,password:string)=>establish('/auth/register',{name:name.trim(),email:email.trim().toLowerCase(),password}),[establish]);
  const completeSso=useCallback(async(token:string):Promise<User>=>{
    const started=++generation.current;request.next();
    const marker=newMarker();
    setStoredToken(marker);setUser(null);setSessionError(null);setIsLoading(true);
    const current=()=>mounted.current && generation.current===started && getStoredToken()===marker;
    ssoPending.current++;
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
    }finally{ssoPending.current--;if(current())setIsLoading(false);}
  },[invalidate,request]);
  const logout=useCallback(async()=>{
    forgetSsoReturn();
    const token=getStoredToken();generation.current++;request.next();setStoredToken(null);setUser(null);setSessionError(null);setIsLoading(false);
    // The API revokes the session and clears the cookie. Local sign-out succeeds while offline.
    if(token){try{await api.post('/auth/logout',undefined,{timeout:5000});}catch{/* offline */}}
  },[request]);
  const renderedGeneration=generation.current;
  const updateUser=useCallback((updated:User,verifiedToken?:string)=>{
    if(!mounted.current || generation.current!==renderedGeneration)return;
    if(verifiedToken){
      if(verifiedToken!==getStoredToken())return;
      generation.current++;request.next();setUser(currentSessionUser(updated));setSessionError(null);setIsLoading(false);
    }else setUser(current=>current?.id===updated.id?{...current,name:updated.name}:current);
  },[renderedGeneration,request]);
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
