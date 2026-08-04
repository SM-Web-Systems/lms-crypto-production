import React, { useEffect, useState } from 'react';
import NftCard from '../NftCard';
import { getUserNfts } from '../../services/walletService';
import type { NFTResponse } from '../../types/api';

interface NftBadgesSectionProps {
  walletAddress: string | null | undefined;
}

const NftBadgesSection: React.FC<NftBadgesSectionProps> = ({ walletAddress }) => {
  const [nftBadges, setNftBadges] = useState<NFTResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadNfts = async () => {
      if (!walletAddress) {
        setNftBadges(null);
        return;
      }
      try {
        const nfts = await getUserNfts(walletAddress);
        if (!cancelled) setNftBadges(nfts);
      } catch (error) {
        console.error('Failed to load NFT badges:', error);
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
        {nftTokens.length > 0 ? (
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
