import { createHash } from 'node:crypto';
import * as Crypto from 'expo-crypto';
import * as Browser from 'expo-web-browser';
import { Platform } from 'react-native';
import api from '@/lib/api';
import { ammaWalletService, WalletSignInCancelled, walletAccountUrl } from '@/services/ammaWalletService';

jest.mock('expo-crypto',()=>({getRandomBytesAsync:jest.fn(),digestStringAsync:jest.fn(),CryptoDigestAlgorithm:{SHA256:'SHA-256'},CryptoEncoding:{BASE64:'base64'}}));
jest.mock('expo-web-browser',()=>({openAuthSessionAsync:jest.fn(),dismissAuthSession:jest.fn()}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{post:jest.fn()}}));
const browser = Browser.openAuthSessionAsync as jest.Mock;
const post = api.post as jest.Mock;
const result = {token:'session-token',user:{id:'wallet-user',workspaces:['sponsor']}};
const code = 'a'.repeat(64);
const response = (initial:string,overrides = {}) => ({type:'success',url:`lmsmobile://sso-callback?code=${code}&state=${new URL(initial).searchParams.get('app_state')}`, ...overrides});

beforeEach(()=>{
  jest.clearAllMocks();
  let random = 0;
  (Crypto.getRandomBytesAsync as jest.Mock).mockImplementation(async()=>new Uint8Array(32).fill(++random));
  (Crypto.digestStringAsync as jest.Mock).mockImplementation(async(_algorithm,value)=>createHash('sha256').update(value).digest('base64'));
  browser.mockImplementation(async(initial)=>response(initial));
  post.mockResolvedValue({data:{success:true,data:result}});
});
afterEach(()=>{ammaWalletService.cancelSignIn();delete process.env.EXPO_PUBLIC_AMMA_WALLET_URL;delete process.env.EXPO_PUBLIC_API_BASE_URL;});

describe('proof-bound Amma Wallet mobile sign-in',()=>{
  it('uses the existing LMS initiate endpoint and exchanges a code with its verifier over the API',async()=>{
    await expect(ammaWalletService.signIn()).resolves.toEqual(result);
    const [initial,callback] = browser.mock.calls[0];
    expect(callback).toBe('lmsmobile://sso-callback');
    const start = new URL(initial);
    expect(start.pathname).toBe('/api/v1/auth/amma-login');
    expect(start.searchParams.get('client')).toBe('mobile');
    expect(start.searchParams.get('code_challenge_method')).toBe('S256');
    const verifier = '01'.repeat(32);
    expect(start.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(start.toString()).not.toContain(verifier);
    expect(post).toHaveBeenCalledWith('/auth/amma-mobile-session',{code,code_verifier:verifier},{headers:{Authorization:''}});
  });
  it.each([
    (initial:string)=>response(initial,{url:`lmsmobile://sso-callback?code=${code}&state=wrong`}),
    (initial:string)=>response(initial,{url:response(initial).url.replace('lmsmobile:','evil:')}),
    (initial:string)=>response(initial,{url:response(initial).url.replace('sso-callback?','sso-callback/other?')}),
    (initial:string)=>response(initial,{url:response(initial).url+'&state=duplicate'}),
    (initial:string)=>response(initial,{url:response(initial).url+'&code='+code}),
    (initial:string)=>response(initial,{url:response(initial).url.replace('code='+code,'token=bearer-token')}),
  ])('rejects unsolicited, malformed, ambiguous and bearer-token callbacks',async(makeResponse)=>{
    browser.mockImplementationOnce(async(initial)=>makeResponse(initial));
    await expect(ammaWalletService.signIn()).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('surfaces wallet verification errors without exchanging a session',async()=>{
    browser.mockImplementationOnce(async(initial)=>response(initial,{url:response(initial).url.replace('code='+code,'error=verify_failed')}));
    await expect(ammaWalletService.signIn()).rejects.toThrow('AmmaWallet could not complete sign-in');
    expect(post).not.toHaveBeenCalled();
  });
  it.each(['cancel','dismiss'])('handles browser %s without creating a local account',async(type)=>{
    browser.mockResolvedValueOnce({type});
    await expect(ammaWalletService.signIn()).rejects.toBeInstanceOf(WalletSignInCancelled);
    expect(post).not.toHaveBeenCalled();
  });
  it('blocks parallel attempts and ignores a callback after local sign-out',async()=>{
    let finish!:(value:unknown)=>void;
    browser.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const pending = ammaWalletService.signIn();
    await new Promise(resolve=>setTimeout(resolve,0));
    const outcome = expect(pending).rejects.toBeInstanceOf(WalletSignInCancelled);
    await expect(ammaWalletService.signIn()).rejects.toThrow('already open');
    const initial = browser.mock.calls[0][0];
    ammaWalletService.cancelSignIn();finish(response(initial));
    await outcome;expect(post).not.toHaveBeenCalled();
    expect(Browser.dismissAuthSession).toHaveBeenCalledTimes(1);
  });
  it('drops an exchange result that arrives after cancellation',async()=>{
    let finish!:(value:unknown)=>void;
    post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const pending = ammaWalletService.signIn();
    await new Promise(resolve=>setTimeout(resolve,0));
    const outcome = expect(pending).rejects.toBeInstanceOf(WalletSignInCancelled);
    ammaWalletService.cancelSignIn();finish({data:{success:true,data:result}});
    await outcome;
  });
  it('permits a new sign-in after a failed exchange',async()=>{
    post.mockRejectedValueOnce(new Error('Session exchange timed out'));
    await expect(ammaWalletService.signIn()).rejects.toThrow('timed out');
    await expect(ammaWalletService.signIn()).resolves.toEqual(result);
    expect(browser).toHaveBeenCalledTimes(2);
    expect(browser.mock.calls[0][0]).not.toBe(browser.mock.calls[1][0]);
  });
  it.each(['javascript:alert(1)','https://user:secret@example.invalid','https://example.invalid?unexpected=yes'])('rejects an unsafe configured wallet origin %s',base=>{
    process.env.EXPO_PUBLIC_AMMA_WALLET_URL = base;
    expect(()=>walletAccountUrl('register')).toThrow();
  });
  it('keeps registration and recovery on the configured wallet host',()=>{
    process.env.EXPO_PUBLIC_AMMA_WALLET_URL = 'https://wallet.example.invalid';
    expect(walletAccountUrl('register')).toBe('https://wallet.example.invalid/register?source=lms');
    expect(walletAccountUrl('recover')).toBe('https://wallet.example.invalid/forgot-password');
  });
  it('does not start a custom-scheme login from a browser preview',async()=>{
    const platform = Platform.OS;
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    try {
      await expect(ammaWalletService.signIn()).rejects.toThrow('web dashboard');
      expect(browser).not.toHaveBeenCalled();expect(post).not.toHaveBeenCalled();
    } finally { Object.defineProperty(Platform,'OS',{configurable:true,value:platform}); }
  });
});
