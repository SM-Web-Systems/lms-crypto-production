import React, { useEffect, useState } from 'react';
import { Wallet, RefreshCw } from 'lucide-react';
import { adminCertificateService, type MinterBalance } from '../services/adminCertificateService';

/** F24: shows the NFT minter wallet's XLM to admins who can mint, so a mint never starts on an empty wallet. */
export const MinterBalanceCard: React.FC = () => {
  const [balance, setBalance] = useState<MinterBalance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (fresh = false) => {
    setLoading(true);
    setBalance(await adminCertificateService.getMinterBalance(fresh));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  if (!loading && !balance) return null;
  return (
    <div
      className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${balance?.configured && balance.low ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-white'}`}
      data-testid="minter-balance"
    >
      <Wallet className="h-4 w-4 text-neutral-500" aria-hidden />
      <p className="text-sm text-neutral-800">
        <span className="font-semibold">Minter wallet</span>
        {balance && !balance.configured ? (
          ': minting is not set up on this server.'
        ) : balance && !balance.funded ? (
          <> ({balance.network === 'public' ? 'mainnet' : balance.network}): account {balance.publicKey.slice(0, 6)}…{balance.publicKey.slice(-4)} is not funded yet.</>
        ) : balance ? (
          <>
            {' '}({balance.network === 'public' ? 'mainnet' : balance.network}): {Number(balance.availableXlm).toFixed(2)} XLM available
            {' '}of {Number(balance.balanceXlm).toFixed(2)}, about {balance.estimatedMintsLeft} mints
          </>
        ) : ' loading…'}
      </p>
      {balance?.configured && balance.low && <p className="text-xs font-medium text-amber-800">Low balance: top up before minting.</p>}
      <button
        type="button"
        onClick={() => void load(true)}
        className="ml-auto p-1 rounded text-neutral-400 hover:text-neutral-700"
        aria-label="Refresh minter balance"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
      </button>
    </div>
  );
};

export default MinterBalanceCard;
