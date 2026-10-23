import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';
import api from '@/lib/api';
import { assertApiSuccess } from '@/utils/apiError';
import type { ApiResponse } from '@/types/api';
import type { AuthResult } from './authService';

const RETURN_URL = 'lmsmobile://sso-callback';
let activeAttempt: object | null = null;

export class WalletSignInCancelled extends Error {
  constructor() { super('Sign-in was cancelled.'); this.name = 'WalletSignInCancelled'; }
}

function applicationUrl(base: string, path: string): URL {
  const url = new URL(base);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('The sign-in address is not configured correctly.');
  }
  url.pathname = url.pathname.replace(/\/$/,'') + path;
  return url;
}

export function walletAccountUrl(action: 'register' | 'recover'): string {
  const base = process.env.EXPO_PUBLIC_AMMA_WALLET_URL || 'https://ammawallet.com';
  const url = applicationUrl(base, action === 'register' ? '/register' : '/forgot-password');
  if (action === 'register') url.searchParams.set('source','lms');
  return url.toString();
}

export async function openWalletAccount(action: 'register' | 'recover'): Promise<void> {
  await Linking.openURL(walletAccountUrl(action));
}

export const ammaWalletService = {
  cancelSignIn() {
    if (!activeAttempt) return;
    activeAttempt = null;
    try { WebBrowser.dismissAuthSession(); } catch { /* The browser may already have closed. */ }
  },
  async signIn(): Promise<AuthResult> {
    if (Platform.OS === 'web') throw new Error('Use the LMS web dashboard to sign in from this browser.');
    if (activeAttempt) throw new Error('A wallet sign-in is already open. Complete or cancel it first.');
    const attempt = {};
    activeAttempt = attempt;
    const assertActive = () => { if (activeAttempt !== attempt) throw new WalletSignInCancelled(); };
    try {
      // Async native randomness never uses the development Math.random fallback.
      const hex = (bytes: Uint8Array) => Array.from(bytes,value => value.toString(16).padStart(2,'0')).join('');
      const verifier = hex(await Crypto.getRandomBytesAsync(32));
      const state = hex(await Crypto.getRandomBytesAsync(32));
      const challenge = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,verifier,{encoding:Crypto.CryptoEncoding.BASE64}))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      assertActive();
      const start = applicationUrl(process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1','/auth/amma-login');
      start.searchParams.set('client','mobile');
      start.searchParams.set('code_challenge',challenge);
      start.searchParams.set('code_challenge_method','S256');
      start.searchParams.set('app_state',state);
      const result = await WebBrowser.openAuthSessionAsync(start.toString(),RETURN_URL);
      assertActive();
      if (result.type !== 'success') throw new WalletSignInCancelled();
      const callback = new URL(result.url);
      if (callback.protocol !== 'lmsmobile:' || callback.host !== 'sso-callback' || !['','/'].includes(callback.pathname)
        || callback.username || callback.password || callback.hash || callback.searchParams.getAll('state').length !== 1
        || callback.searchParams.get('state') !== state) throw new Error('The sign-in response could not be verified. Please start again.');
      if (callback.searchParams.has('error')) throw new Error('AmmaWallet could not complete sign-in. Please try again.');
      const code = callback.searchParams.get('code');
      if (callback.searchParams.getAll('code').length !== 1 || !code || !/^[a-f0-9]{64}$/.test(code)) {
        throw new Error('The sign-in response is incomplete. Please start again.');
      }
      const response = await api.post<ApiResponse<AuthResult>>('/auth/amma-mobile-session',
        {code,code_verifier:verifier},{headers:{Authorization:''}});
      assertActive();
      return assertApiSuccess(response,'Could not complete wallet sign-in. Please try again.');
    } finally {
      // Verifier and correlation state live only in this attempt, never persisted or logged.
      if (activeAttempt === attempt) activeAttempt = null;
    }
  },
};
