import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosHeaders } from 'axios';
import api from '../services/api';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../context/useAuth';
import SsoCallback from '../pages/SsoCallback';
import { ApiRequestError } from '../utils/apiError';
import type { User } from '../types/api';

const walletUser: User = {id:'wallet-user',name:'Wallet learner',email:'wallet@example.invalid',role:'student',walletAddress:null,walletLinkingStatus:'none',workspaces:['student'],defaultWorkspace:'student',permissions:['course.view']};
const internalUser: User = {...walletUser,id:'internal-user',email:'internal@example.invalid',role:'admin',workspaces:['admin'],defaultWorkspace:'admin'};
let signOut:(()=>Promise<void>)|undefined;
const originalAdapter=api.defaults.adapter;
const reads: string[] = [];

function Session() {
  const auth=useAuth();signOut=auth.logout;
  return <><p data-testid="current-identity">{auth.user?.id || 'Signed out'}</p><Routes>
    <Route path="/internal" element={<><button onClick={()=>void auth.login(internalUser.email,'internal-password').catch(()=>{})}>Internal login</button><Link to="/sso-callback">Complete wallet return</Link></>}/>
    <Route path="/sso-callback" element={<SsoCallback/>}/>
    <Route path="/student" element={<p>Wallet dashboard</p>}/>
    <Route path="/admin" element={<p>Internal dashboard</p>}/>
  </Routes></>;
}
beforeEach(()=>{
  localStorage.clear();reads.length=0;
  window.history.replaceState({},'','/');
  api.defaults.adapter=async(config)=>{
    const token=String(AxiosHeaders.from(config.headers).get('Authorization') || '');
    if(config.url==='/auth/me')reads.push(token);
    const data=config.url==='/auth/login' ? {token:'internal-token',user:internalUser}
      : token==='Bearer wallet-token' ? walletUser : internalUser;
    return {status:200,statusText:'OK',headers:{},config,data:{success:true,data}};
  };
});
afterEach(async()=>{vi.restoreAllMocks();if(signOut)await act(async()=>{await signOut!();});api.defaults.adapter=originalAdapter;});

describe('real AuthProvider and AmmaWallet callback composition',()=>{
  it('replaces an earlier in-memory internal token when local storage becomes available for SSO',async()=>{
    render(<MemoryRouter initialEntries={['/internal']}><AuthProvider><Session/></AuthProvider></MemoryRouter>);
    await waitFor(()=>expect(screen.getByTestId('current-identity')).toHaveTextContent('Signed out'));
    vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw new DOMException('Storage unavailable');});
    fireEvent.click(screen.getByText('Internal login'));
    await waitFor(()=>expect(screen.getByTestId('current-identity')).toHaveTextContent('internal-user'));
    window.history.replaceState({},'','/sso-callback#token=wallet-token');
    fireEvent.click(screen.getByText('Complete wallet return'));
    await waitFor(()=>expect(screen.getByTestId('current-identity')).toHaveTextContent('wallet-user'));
    expect(reads[reads.length-1]).toBe('Bearer wallet-token');
    expect(await screen.findByText('Wallet dashboard')).toBeInTheDocument();
  });
  it('finishes wallet navigation after provider-level outage recovery remounts the callback without its hash',async()=>{
    window.history.replaceState({},'','/sso-callback#token=wallet-token');
    const adapter=api.defaults.adapter as (config:any)=>Promise<any>;
    let online=false;
    api.defaults.adapter=async(config)=>{
      if(config.url==='/auth/me'&&!online)throw new ApiRequestError({status:503,message:'Fixture server outage'});
      return adapter(config);
    };
    render(<MemoryRouter initialEntries={['/sso-callback']}><AuthProvider><Session/></AuthProvider></MemoryRouter>);
    await waitFor(()=>expect(screen.getByText('Reconnect to your account')).toBeInTheDocument());
    expect(window.location.hash).toBe('');
    online=true;fireEvent.click(screen.getByText('Try again'));
    await waitFor(()=>expect(screen.getByText('Wallet dashboard')).toBeInTheDocument());
    expect(screen.getByTestId('current-identity')).toHaveTextContent('wallet-user');
    expect(screen.queryByText('Sign-in failed')).not.toBeInTheDocument();
  });
  it('can establish the wallet session in memory when browser persistence is unavailable',async()=>{
    window.history.replaceState({},'','/sso-callback#token=wallet-token');
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Storage denied');});
    render(<MemoryRouter initialEntries={['/sso-callback']}><AuthProvider><Session/></AuthProvider></MemoryRouter>);
    await waitFor(()=>expect(screen.getByText('Wallet dashboard')).toBeInTheDocument());
    expect(screen.getByTestId('current-identity')).toHaveTextContent('wallet-user');
    expect(reads.every(value=>value==='Bearer wallet-token')).toBe(true);
  });
  it('does not accept an older internal-login result after a wallet sign-in starts',async()=>{
    const adapter=api.defaults.adapter as (config:any)=>Promise<any>;
    let finish!:(value:any)=>void;
    let internalConfig:any;
    api.defaults.adapter=async(config)=>{
      if(config.url==='/auth/login'){internalConfig=config;return new Promise(resolve=>{finish=resolve;});}
      return adapter(config);
    };
    render(<MemoryRouter initialEntries={['/internal']}><AuthProvider><Session/></AuthProvider></MemoryRouter>);
    fireEvent.click(screen.getByText('Internal login'));
    await waitFor(()=>expect(finish).toBeDefined());
    window.history.replaceState({},'','/sso-callback#token=wallet-token');fireEvent.click(screen.getByText('Complete wallet return'));
    await waitFor(()=>expect(screen.getByText('Wallet dashboard')).toBeInTheDocument());
    await act(async()=>finish({status:200,statusText:'OK',headers:{},config:internalConfig,data:{success:true,data:{token:'late-internal-token',user:internalUser}}}));
    expect(screen.getByTestId('current-identity')).toHaveTextContent('wallet-user');
    expect(localStorage.getItem('lms_token')).toBe('wallet-token');
  });
  it('does not restore wallet identity after local logout during verification',async()=>{
    window.history.replaceState({},'','/sso-callback#token=wallet-token');
    const adapter=api.defaults.adapter as (config:any)=>Promise<any>;
    let finish!:(value:any)=>void;let requestConfig:any;
    api.defaults.adapter=async(config)=>{
      if(config.url==='/auth/me'){requestConfig=config;return new Promise(resolve=>{finish=resolve;});}
      return adapter(config);
    };
    render(<MemoryRouter initialEntries={['/sso-callback']}><AuthProvider><Session/></AuthProvider></MemoryRouter>);
    await waitFor(()=>expect(finish).toBeDefined());
    await act(async()=>{await signOut!();});
    await act(async()=>finish({status:200,statusText:'OK',headers:{},config:requestConfig,data:{success:true,data:walletUser}}));
    expect(screen.getByTestId('current-identity')).toHaveTextContent('Signed out');
    expect(localStorage.getItem('lms_token')).toBeNull();
  });
});
