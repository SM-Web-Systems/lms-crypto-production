import { SearchInput } from './Pagination';
import type { SubmissionStatus } from '../types/api';
import { SUBMISSION_STATUSES } from '../context/useSubmissionCounts';

const LABELS: Record<SubmissionStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

/** Search and status filter for a submissions list; both are applied by the server. */
export function SubmissionFilters({ search, status, counts, onChange }: {
  search: string;
  status: string;
  counts?: Record<SubmissionStatus, number> | null;
  onChange: (patch: { search?: string; status?: string }, options?: { replace?: boolean }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        label="Search submissions"
        placeholder="Search by title or student…"
        value={search}
        onSearch={(value) => onChange({ search: value }, { replace: true })}
      />
      <select
        aria-label="Status"
        value={status}
        onChange={(e) => onChange({ status: e.target.value })}
        className="touch-target text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
      >
        <option value="">All statuses</option>
        {SUBMISSION_STATUSES.map((s) => (
          <option key={s} value={s}>{LABELS[s]}{counts ? ` (${counts[s]})` : ''}</option>
        ))}
      </select>
    </div>
  );
}
