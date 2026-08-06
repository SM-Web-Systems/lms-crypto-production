import React, { useEffect, useState } from 'react';
import { Card, CardContent } from './Card';
import { getWalletStatus } from '../services/walletService';
import type { User, WalletStatusResponse } from '../types/api';
import { Wallet, AlertCircle, Copy, ExternalLink, CheckCircle } from 'lucide-react';

interface Props {
  user: User;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

const StudentWalletStatusCard: React.FC<Props> = ({ user }) => {
  const [status, setStatus] = useState<WalletStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user.walletLinkingStatus !== 'linked') return;
    let cancelled = false;
    setLoading(true);
    getWalletStatus()
      .then((s) => { if (!cancelled) { setStatus(s); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [user.walletLinkingStatus]);

  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  // State A — no wallet
  if (user.walletLinkingStatus === 'none' || !user.walletLinkingStatus) {
    return (
      <Card className="bg-gradient-to-br from-amber-50/80 via-white to-orange-50/60">
        <CardContent className="flex items-start gap-4 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900 text-sm">Wallet not linked</p>
            <p className="text-xs text-amber-800/80 mt-0.5">Link your AmmaWallet to receive course certificates.</p>
          </div>
          <a
            href="/api/v1/auth/amma-login"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            Sign in with AmmaWallet
          </a>
        </CardContent>
      </Card>
    );
  }

  // State B — existing_account
  if (user.walletLinkingStatus === 'existing_account') {
    return (
      <Card className="bg-gradient-to-br from-amber-50/80 via-white to-orange-50/60">
        <CardContent className="flex items-start gap-4 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900 text-sm">AmmaWallet action needed</p>
            <p className="text-xs text-amber-800/80 mt-0.5">An AmmaWallet account already exists for your email. Sign in to link it.</p>
          </div>
          <a
            href="https://ammawallet.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            Open AmmaWallet
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </CardContent>
      </Card>
    );
  }

  // Error state (linked but status fetch failed)
  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-5">
          <Wallet className="h-5 w-5 text-neutral-400 shrink-0" aria-hidden="true" />
          <p className="text-sm text-neutral-500">Unable to load wallet details. Try refreshing.</p>
        </CardContent>
      </Card>
    );
  }

  // State C — linked
  const walletAddr = user.walletAddress;
  const xlmBalance = status?.xlmBalance;

  return (
    <Card className="bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60">
      <CardContent className="py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: icon + status */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
                  <CheckCircle className="h-3 w-3" aria-hidden="true" />
                  Wallet linked
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-700/10 text-emerald-900 text-xs font-medium">
                  Mainnet
                </span>
              </div>
              {walletAddr && (
                <button
                  onClick={() => copyAddress(walletAddr)}
                  className="mt-1.5 flex items-center gap-1.5 text-xs font-mono text-neutral-500 hover:text-neutral-800 transition-colors"
                  title={walletAddr}
                  aria-label="Copy wallet address"
                >
                  {truncateAddress(walletAddr)}
                  <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {copied && <span className="text-emerald-600 font-sans not-italic">Copied!</span>}
                </button>
              )}
            </div>
          </div>

          {/* Right: balance + link */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-neutral-500">XLM balance</p>
              {loading ? (
                <div className="mt-1 h-4 w-16 animate-pulse rounded bg-neutral-200" />
              ) : (
                <p className="text-sm font-semibold text-neutral-800">
                  {xlmBalance != null ? `${xlmBalance.toFixed(2)} XLM` : '—'}
                </p>
              )}
            </div>
            <a
              href="https://ammawallet.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium transition-colors"
            >
              Open in AmmaWallet
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentWalletStatusCard;
