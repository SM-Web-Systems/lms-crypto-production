import React, { useEffect, useState } from 'react';
import { Award, Loader2, ArrowUpDown, Search, X } from 'lucide-react';
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
  const [search, setSearch] = useState('');

  useEffect(() => {
    courseCompletionService
      .getMyCredentials()
      .then(setCredentials)
      .catch(() => setError('Failed to load badges'))
      .finally(() => setLoading(false));
  }, []);

  // Search filter (substring on courseTitle/courseCode)
  const searched = search.trim()
    ? credentials.filter((c) => {
        const q = search.toLowerCase();
        return (
          (c.courseTitle ?? '').toLowerCase().includes(q) ||
          (c.courseCode ?? '').toLowerCase().includes(q)
        );
      })
    : credentials;

  // Course dropdown options derived from searched results
  const courseTitles = [...new Set(searched.map((c) => c.courseTitle).filter(Boolean))] as string[];

  // Course dropdown filter (exact match, applied after search)
  const filtered = filter
    ? searched.filter((c) => c.courseTitle === filter)
    : searched;

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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" aria-hidden />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search badges..."
                className="rounded-lg border border-neutral-200 pl-9 pr-8 py-1.5 text-sm text-neutral-700 bg-white w-full sm:w-56"
                aria-label="Search badges"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
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

      {credentials.length === 0 ? (
        <div className="text-center py-16">
          <Award className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-neutral-700 mb-1">No badges yet</h2>
          <p className="text-sm text-neutral-500">
            Complete courses to earn blockchain-verified certificates.
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-neutral-700 mb-1">No matching badges</h2>
          <p className="text-sm text-neutral-500">
            Try a different search term or filter.
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
