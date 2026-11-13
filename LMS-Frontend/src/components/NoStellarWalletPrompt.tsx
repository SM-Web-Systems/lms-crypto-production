import { Wallet } from 'lucide-react';
import { AMMA_WALLET_URL } from '../utils/walletSignIn';

/**
 * Shown when an AmmaWallet-connected learner has no active Stellar mainnet wallet. Wallets are
 * created by the learner in AmmaWallet (they keep the recovery phrase); the LMS only reads the
 * public address on the next sign-in or refresh.
 */
export function NoStellarWalletPrompt({ context }: { context: 'profile' | 'certificate' }) {
  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">You don't have a Stellar wallet yet</p>
      <p className="mt-1">
        {context === 'certificate'
          ? 'Certificates and rewards are sent to your Stellar wallet. Create one in AmmaWallet before you request a paid certificate.'
          : 'Certificates and rewards are sent to your Stellar wallet. Create one in AmmaWallet, then come back and refresh.'}
      </p>
      <a
        href={`${AMMA_WALLET_URL}/onboarding`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        Create a Stellar wallet in AmmaWallet
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
