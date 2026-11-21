import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle, ExternalLink, Download, AlertCircle, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import SocialShare from '../components/SocialShare';
import { certificatePdfViewPath } from '../lib/certificatePdf';

interface VerifiedCredential {
  credentialId: string;
  studentName: string;
  courseTitle: string;
  courseCode: string;
  walletAddress: string;
  txHash: string | null;
  contractId: string;
  network: string;
  sorobanTokenId: number | null;
  issuedAt: string;
  issuer: string;
}

const CertificateVerification: React.FC = () => {
  const { credentialId } = useParams<{ credentialId: string }>();
  const [credential, setCredential] = useState<VerifiedCredential | null>(null);
  const [loading, setLoading] = useState(true);
  // 'missing' only when the API says so (404); a network or server failure is 'unavailable', never "does not exist".
  const [failure, setFailure] = useState<'missing' | 'unavailable' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const apiBase = import.meta.env?.VITE_API_BASE_URL || '/api/v1';

  useEffect(() => {
    if (!credentialId) return;
    let cancelled = false;
    setLoading(true);
    setCredential(null);
    setQrDataUrl(null);
    fetch(`${apiBase}/credentials/verify/${encodeURIComponent(credentialId)}`)
      .then(async (res) => {
        if (res.status === 404) return 'missing' as const;
        if (!res.ok) return 'unavailable' as const;
        const found = (await res.json())?.data?.credential as VerifiedCredential | undefined;
        if (!found) return 'unavailable' as const;
        if (!cancelled) setCredential(found);
        return null;
      })
      .catch(() => 'unavailable' as const)
      .then((result) => { if (!cancelled) { setFailure(result); setLoading(false); } });
    return () => { cancelled = true; };
  }, [credentialId, apiBase, attempt]);

  useEffect(() => {
    if (!credential) return;
    const url = `${window.location.origin}/verify/${credential.credentialId}`;
    QRCode.toDataURL(url, { width: 160, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [credential]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (failure || !credential) {
    const missing = failure === 'missing';
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md" role={missing ? undefined : 'alert'}>
          <AlertCircle className="h-12 w-12 text-neutral-400 mx-auto mb-4" aria-hidden />
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            {missing ? 'Certificate not found' : "We couldn't check this certificate right now"}
          </h1>
          <p className="text-sm text-neutral-500">
            {missing
              ? 'No issued certificate matches this link. Check that the link is complete, or ask the person who shared it for a new one.'
              : 'This is a problem on our side or with the connection, not with the certificate. Please try again in a moment.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {!missing && (
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                Try again
              </button>
            )}
            <Link to="/" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
              Go to the home page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const explorerNetwork = credential.network === 'testnet' ? 'testnet' : 'public';
  const formattedDate = new Date(credential.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Verified header */}
        <div className="text-center mb-8">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-neutral-900">Verified Certificate</h1>
          <p className="text-sm text-neutral-500 mt-1">
            This certificate has been verified on the Stellar blockchain.
          </p>
        </div>

        {/* Certificate card */}
        <div className="rounded-2xl border border-violet-200 bg-white shadow-lg p-6 space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-bold text-neutral-900">{credential.courseTitle}</h2>
            {credential.courseCode && (
              <p className="text-sm text-neutral-500 font-mono">{credential.courseCode}</p>
            )}
          </div>

          <div className="text-center">
            <p className="text-sm text-neutral-500">Awarded to</p>
            <p className="text-lg font-semibold text-neutral-900">{credential.studentName}</p>
          </div>

          <div className="text-center">
            <p className="text-sm text-neutral-500">Completed on</p>
            <p className="text-sm font-medium text-neutral-700">{formattedDate}</p>
          </div>

          <div className="text-center">
            <p className="text-xs text-neutral-400">{credential.issuer}</p>
          </div>

          <hr className="border-neutral-200" />

          {/* Blockchain details */}
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold text-neutral-700 text-xs uppercase tracking-wide">
              Blockchain Verification
            </h3>
            {credential.txHash && (
              <div className="flex justify-between items-start gap-2">
                <span className="text-neutral-500 shrink-0">Transaction</span>
                <a
                  href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${credential.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 hover:underline font-mono text-xs break-all text-right inline-flex items-center gap-1"
                >
                  {credential.txHash.slice(0, 12)}...{credential.txHash.slice(-4)}
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-neutral-500">Network</span>
              <span className="text-neutral-700">
                {credential.network === 'testnet' ? 'Stellar Testnet' : 'Stellar Mainnet'}
              </span>
            </div>
            {credential.sorobanTokenId != null && (
              <div className="flex justify-between">
                <span className="text-neutral-500">Token ID</span>
                <span className="text-neutral-700 font-mono">#{credential.sorobanTokenId}</span>
              </div>
            )}
            <div className="flex justify-between items-start gap-2">
              <span className="text-neutral-500 shrink-0">Wallet</span>
              <span className="text-neutral-700 font-mono text-xs break-all text-right">
                {credential.walletAddress}
              </span>
            </div>
          </div>

          {/* Download PDF */}
          <div className="pt-2">
            <Link
              to={certificatePdfViewPath(credential.credentialId)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download Certificate PDF
            </Link>
          </div>

          {/* QR Code */}
          {qrDataUrl && (
            <div className="text-center pt-4">
              <img src={qrDataUrl} alt="QR code" className="mx-auto" width={160} height={160} />
              <p className="text-xs text-neutral-400 mt-1">Scan to verify this certificate</p>
            </div>
          )}

          {/* Social Sharing */}
          <SocialShare
            url={`${window.location.origin}/verify/${credential.credentialId}`}
            title={credential.courseTitle}
          />
        </div>

        <p className="text-center text-xs text-neutral-400 mt-6">
          SM Web Systems Blockchain Academy
        </p>
      </div>
    </div>
  );
};

export default CertificateVerification;
