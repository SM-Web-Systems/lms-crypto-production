import React, { useEffect, useState } from 'react';
import NftCard from '../NftCard';
import { getUserNfts } from '../../services/walletService';
import type { NFTResponse } from '../../types/api';

interface NftBadgesSectionProps {
  walletAddress: string | null | undefined;
}

const NftBadgesSection: React.FC<NftBadgesSectionProps> = ({ walletAddress }) => {
  const [nftBadges, setNftBadges] = useState<NFTResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadNfts = async () => {
      setNftBadges(null);
      setError(false);
      setLoading(Boolean(walletAddress));
      if (!walletAddress) {
        return;
      }
      try {
        const nfts = await getUserNfts(walletAddress);
        if (!cancelled) setNftBadges(nfts);
      } catch (error) {
        console.error('Failed to load NFT badges:', error);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadNfts();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const nftTokens = nftBadges?.indexed.tokens.map((t) => t.token) ?? [];

  return (
    <section>
      <h2 className="text-lg font-bold text-neutral-900 mb-4">Your NFT Badges</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <li className="col-span-full text-sm text-neutral-500">Loading NFT badges…</li>
        ) : error ? (
          <li role="alert" className="col-span-full text-sm text-red-700">Could not load NFT badges. Please try again later.</li>
        ) : !walletAddress ? (
          <li className="col-span-full text-sm text-neutral-500">Connect a wallet to view NFT badges.</li>
        ) : nftTokens.length > 0 ? (
          nftTokens.map((token) => (<li key={token.id}><NftCard token={token} /></li>))
        ) : (
          <li className="col-span-full rounded-xl border border-neutral-200/90 bg-gradient-to-br p-4 shadow-card ring-1 ring-neutral-900/[0.03] text-sm text-neutral-500">
            No NFT badges yet
          </li>
        )}
      </ul>
    </section>
  );
};

export default NftBadgesSection;
