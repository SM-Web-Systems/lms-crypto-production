import React, { useState, useEffect } from 'react';
import { Award, ExternalLink, Download } from 'lucide-react';
import SocialShare from './SocialShare';

interface NFTBadgeProps {
  credentialId: string;
  courseTitle: string;
  courseCode?: string;
  walletAddress: string;
  txHash: string | null;
  sorobanTokenId?: number | null;
  issuedAt: string;
  network?: string;
  isNewlyMinted?: boolean;
}

const CONFETTI_COLORS = [
  '#c9a96e', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1', '#22c55e',
];

const NFTBadge: React.FC<NFTBadgeProps> = ({
  credentialId,
  courseTitle,
  courseCode,
  walletAddress,
  txHash,
  sorobanTokenId,
  issuedAt,
  network = 'public',
  isNewlyMinted = false,
}) => {
  const [showConfetti, setShowConfetti] = useState(isNewlyMinted);

  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);

  const explorerNetwork = network === 'testnet' ? 'testnet' : 'public';
  const formattedDate = new Date(issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const truncatedWallet = `${walletAddress.slice(0, 4)}\u2026${walletAddress.slice(-4)}`;
  const apiBase = import.meta.env?.VITE_API_BASE_URL || '/api/v1';

  return (
    <div className="relative rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/40 px-4 py-4 shadow-card ring-1 ring-neutral-900/[0.02] overflow-hidden">
      {/* Confetti animation */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          {CONFETTI_COLORS.map((color, i) => (
            <span
              key={i}
              className="absolute w-1.5 h-1.5 rounded-sm animate-confetti"
              style={{
                backgroundColor: color,
                left: `${8 + i * 7.5}%`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-neutral-900 truncate">{courseTitle}</p>
              {courseCode && (
                <span className="text-xs text-neutral-500 font-mono">{courseCode}</span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 text-xs font-medium">
                <Award className="h-3 w-3" aria-hidden />
                NFT Issued
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
              <span>{formattedDate}</span>
              <span className="font-mono">{truncatedWallet}</span>
              {sorobanTokenId != null && <span>Token #{sorobanTokenId}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {txHash && (
              <a
                href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 hover:underline transition-colors"
              >
                View on Stellar
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            <SocialShare
              url={`${window.location.origin}/verify/${credentialId}`}
              title={courseTitle}
              compact
            />
            <a
              href={`${apiBase}/credentials/${credentialId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <Download className="h-3 w-3" aria-hidden />
              PDF
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NFTBadge;
