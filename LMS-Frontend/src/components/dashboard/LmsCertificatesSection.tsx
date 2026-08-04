import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { courseCompletionService } from '../../services/courseCompletionService';
import type { MyCredential } from '../../types/api';
import { AlertCircle, Award, ExternalLink } from 'lucide-react';

const LmsCertificatesSection: React.FC = () => {
  const { user } = useAuth();
  const [lmsCredentials, setLmsCredentials] = useState<MyCredential[] | null>(null);
  const [lmsCredentialsError, setLmsCredentialsError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    courseCompletionService
      .getMyCredentials()
      .then((list) => {
        if (!cancelled) {
          setLmsCredentials(list);
          setLmsCredentialsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLmsCredentials(null);
          setLmsCredentialsError(true);
        }
      });
    return () => { cancelled = true; };
  }, [user]);

  if (!lmsCredentialsError && (lmsCredentials === null || lmsCredentials.length === 0)) {
    return null;
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-neutral-900 mb-4">LMS Certificates</h2>
      {lmsCredentialsError ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
          <span>
            We could not load your certificates right now. Please refresh the page to try again.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {lmsCredentials!.map((cred) => (
            <div
              key={cred.credentialId}
              className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/40 px-4 py-4 shadow-card ring-1 ring-neutral-900/[0.02]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-neutral-900 truncate">
                      {cred.courseTitle ?? cred.quizTitle ?? 'Certificate'}
                    </p>
                    {cred.courseCode && (
                      <span className="text-xs text-neutral-500 font-mono">{cred.courseCode}</span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 text-xs font-medium">
                      <Award className="h-3 w-3" aria-hidden />
                      NFT Issued
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
                    {cred.issuedAt && (
                      <span>Issued {new Date(cred.issuedAt).toLocaleDateString()}</span>
                    )}
                    {cred.walletAddress && (
                      <span className="font-mono">
                        {cred.walletAddress.slice(0, 4)}…{cred.walletAddress.slice(-4)}
                      </span>
                    )}
                  </div>
                </div>
                {cred.txHash && (
                  <a
                    href={`https://stellar.expert/explorer/public/tx/${cred.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 hover:underline transition-colors"
                  >
                    View on Stellar
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default LmsCertificatesSection;
