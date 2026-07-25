import React from 'react';
import { Wallet, ExternalLink, X } from 'lucide-react';

interface WalletLinkingBannerProps {
  onDismiss: () => void;
}

const WalletLinkingBanner: React.FC<WalletLinkingBannerProps> = ({ onDismiss }) => {
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            AmmaWallet account already exists for this email
          </p>
          <p className="mt-1 text-sm text-amber-800">
            An AmmaWallet account is already registered for your email address. Sign in to AmmaWallet
            or reset your AmmaWallet password to enable wallet features. Your course access and
            progress are not affected.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="https://ammawallet.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
            >
              Open AmmaWallet
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a
              href="https://ammawallet.com/forgot-password"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors"
            >
              Reset AmmaWallet password
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 text-amber-500 hover:bg-amber-100 hover:text-amber-700 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default WalletLinkingBanner;
