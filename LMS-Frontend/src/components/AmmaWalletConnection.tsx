import { useState } from 'react';
import type { User } from '../types/api';
import api from '../services/api';
import type { ApiResponse } from '../types/api';
import { assertApiSuccess, getErrorMessage } from '../utils/apiError';
import { AMMA_WALLET_URL, SSO_ERROR_MESSAGES } from '../utils/walletSignIn';

export const walletNavigation = {go: (url: string) => window.location.assign(url)};

/** Explicit consent for conversion; refresh is bound to the authenticated Wallet ID. */
export default function AmmaWalletConnection({user, errorCode}: {user: User; errorCode?: string | null}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = user.authProvider === 'ammawallet';
  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await api.post<ApiResponse<{url: string}>>('/auth/amma-link', connected ? {} : {password});
      const {url} = assertApiSuccess(response, 'Could not connect to AmmaWallet.');
      const destination = new URL(url);
      if (!['https:', 'http:'].includes(destination.protocol)) throw new Error('Invalid Wallet sign-in address.');
      setPassword('');
      walletNavigation.go(destination.toString());
    } catch (err) {
      setError(getErrorMessage(err, 'Could not connect to AmmaWallet. Please try again.'));
    } finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-neutral-200 p-4 space-y-3" aria-label="AmmaWallet connection">
    <h2 className="font-semibold text-neutral-900">AmmaWallet connection</h2>
    {errorCode && <div role="alert" className="text-sm text-amber-800">
      {SSO_ERROR_MESSAGES[errorCode] ?? 'Could not connect AmmaWallet. Start again below.'}
      {(errorCode === 'email_required' || errorCode === 'email_unverified') &&
        <a href={`${AMMA_WALLET_URL}/settings`} className="block font-semibold underline">Open AmmaWallet settings</a>}
    </div>}
    {connected ? <>
      <p className="text-sm text-neutral-600">The address below was confirmed at your last Wallet sign-in. Refresh after creating or deactivating a wallet.</p>
      <p className="text-sm font-mono break-all">{user.walletAddress || 'No active mainnet wallet was reported.'}</p>
      <p className="text-sm text-neutral-600">AmmaWallet supplies your newest active mainnet wallet, which may differ from the wallet selected in its dashboard. Check the full address before requesting a certificate. Issued certificates keep their original recipient.</p>
    </> : <p className="text-sm text-neutral-600">Confirm your current LMS password, then sign in to AmmaWallet with the same verified email ({user.email}). Connecting changes this account to AmmaWallet sign-in and ends its existing LMS sessions. Your courses and roles stay with this account.</p>}
    <form onSubmit={start} className="space-y-3">
      {!connected && <div>
        <label htmlFor="wallet-link-password" className="block text-sm font-medium text-neutral-700">Current LMS password</label>
        <input id="wallet-link-password" type="password" autoComplete="current-password" required maxLength={1024}
          value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 p-2" />
      </div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? 'Connecting…' : connected ? 'Refresh from AmmaWallet' : 'Connect AmmaWallet'}
      </button>
    </form>
  </section>;
}
