import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { courseCompletionService } from '../../services/courseCompletionService';
import type { MyCredential } from '../../types/api';
import { AlertCircle } from 'lucide-react';
import NFTBadge from '../NFTBadge';

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
            <NFTBadge
              key={cred.credentialId}
              credentialId={cred.credentialId}
              courseTitle={cred.courseTitle ?? cred.quizTitle ?? 'Certificate'}
              courseCode={cred.courseCode ?? undefined}
              walletAddress={cred.walletAddress}
              txHash={cred.txHash}
              issuedAt={cred.issuedAt}
              network="public"
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default LmsCertificatesSection;
