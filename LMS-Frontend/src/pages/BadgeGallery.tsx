import React, { useEffect, useState } from 'react';
import { Award, Loader2, ArrowUpDown } from 'lucide-react';
import NFTBadge from '../components/NFTBadge';
import { courseCompletionService } from '../services/courseCompletionService';
import type { MyCredential } from '../types/api';

type SortOrder = 'newest' | 'oldest';

const BadgeGallery: React.FC = () => {
  const [credentials, setCredentials] = useState<MyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  useEffect(() => {
    courseCompletionService
      .getMyCredentials()
      .then(setCredentials)
      .catch(() => setError('Failed to load badges'))
      .finally(() => setLoading(false));
  }, []);

  const courseTitles = [...new Set(credentials.map((c) => c.courseTitle).filter(Boolean))] as string[];

  const filtered = filter
    ? credentials.filter((c) => c.courseTitle === filter)
    : credentials;

  const sorted = [...filtered].sort((a, b) => {
    const diff = new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime();
    return sortOrder === 'newest' ? -diff : diff;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl font-bold text-neutral-900">My Badges</h1>
        {credentials.length > 0 && (
          <div className="flex items-center gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 bg-white"
              aria-label="Filter by course"
            >
              <option value="">All Courses</option>
              {courseTitles.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
              aria-label={sortOrder === 'newest' ? 'Sort oldest first' : 'Sort newest first'}
            >
              <ArrowUpDown className="h-4 w-4" aria-hidden />
              {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
            </button>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <Award className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-neutral-700 mb-1">No badges yet</h2>
          <p className="text-sm text-neutral-500">
            Complete courses to earn blockchain-verified certificates.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((cred) => (
            <NFTBadge
              key={cred.credentialId}
              credentialId={cred.credentialId}
              courseTitle={cred.courseTitle || 'Certificate'}
              courseCode={cred.courseCode ?? undefined}
              walletAddress={cred.walletAddress}
              txHash={cred.txHash}
              sorobanTokenId={cred.sorobanTokenId}
              issuedAt={cred.issuedAt}
              network={cred.network ?? 'public'}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BadgeGallery;
