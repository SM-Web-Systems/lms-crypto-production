import { useCallback, useEffect, useState } from 'react';
import { submissionsService } from '../services/submissionsService';
import type { SubmissionStatus } from '../types/api';

export const SUBMISSION_STATUSES: SubmissionStatus[] = ['pending', 'approved', 'rejected'];

/** Server totals per status, from three `limit=1` list calls (UX-003). Null until loaded or if a call fails. */
export function useSubmissionCounts(enabled: boolean) {
  const [counts, setCounts] = useState<Record<SubmissionStatus, number> | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const totals = await Promise.all(SUBMISSION_STATUSES.map((status) =>
        submissionsService.getAll({ status, limit: 1 }).then((r) => r.pagination.total)));
      setCounts({ pending: totals[0], approved: totals[1], rejected: totals[2] });
    } catch {
      setCounts(null); // counts are a hint; the list itself shows the load error
    }
  }, [enabled]);

  useEffect(() => { void reload(); }, [reload]);

  return { counts, reload };
}
