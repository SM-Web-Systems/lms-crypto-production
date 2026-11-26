import React, { useEffect, useState } from 'react';
import { Wallet, AlertTriangle } from 'lucide-react';
import { adminCertificateService, type MinterStatus } from '../services/adminCertificateService';

/**
 * Minter wallet balance for administrators who issue certificates. Each certificate is paid for from this
 * wallet (about 0.11 XLM); without it a run of mints could stop part-way with no warning.
 * Hidden for anyone without certificate.mint (the API answers 403).
 */
export const MinterStatusCard: React.FC = () => {
  const [status, setStatus] = useState<MinterStatus | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const s = await adminCertificateService.getMinterStatus();
        if (live) setStatus(s);
      } catch {
        if (live) setHidden(true);
      }
    })();
    return () => { live = false; };
  }, []);

  if (hidden || !status) return null;
  const short = status.minterAddress ? `${status.minterAddress.slice(0, 6)}…${status.minterAddress.slice(-4)}` : '—';

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 text-sm ${
        status.low ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'
      }`}
      data-testid="minter-status"
    >
      <span className="flex items-center gap-1.5 font-semibold text-neutral-800">
        <Wallet className="h-4 w-4 text-accent-teal" aria-hidden />
        Certificate minter
      </span>
      {status.configured ? (
        <>
          <span className="text-neutral-600">
            Balance:{' '}
            <strong className="tabular-nums text-neutral-900">
              {status.balanceXlm !== null ? `${status.balanceXlm} XLM` : 'unavailable'}
            </strong>
          </span>
          <span className="font-mono text-xs text-neutral-500" title={status.minterAddress ?? undefined}>{short}</span>
          <span className="text-xs text-neutral-500">{status.network === 'public' ? 'Stellar public network' : 'Stellar testnet'}</span>
        </>
      ) : null}
      {status.low && (
        <span className="flex items-center gap-1 text-amber-800">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Low balance: top up the minter before issuing more certificates (about 0.11 XLM each).
        </span>
      )}
      {status.error && !status.low && <span className="text-neutral-600">{status.error}</span>}
    </div>
  );
};

export default MinterStatusCard;
