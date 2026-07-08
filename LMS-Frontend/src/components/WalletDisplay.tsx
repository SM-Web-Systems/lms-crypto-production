import React from 'react';

interface WalletDisplayProps {
  walletAddress?: string;
}

export const WalletDisplay: React.FC<WalletDisplayProps> = ({ walletAddress }) => {
  if (!walletAddress) {
    return null;
  }

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <p className="text-sm text-gray-600">Your Wallet Address</p>
      <p className="font-mono text-lg text-blue-600 break-all">{walletAddress}</p>
      <p className="text-xs text-gray-500 mt-2">
        This wallet will receive NFTs upon course completion
      </p>
    </div>
  );
};