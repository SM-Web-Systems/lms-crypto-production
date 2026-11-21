import { useCallback, useEffect, useState } from 'react';
import { submissionsService } from '../services/submissionsService';
import type { Pagination, Submission } from '../types/api';
import { getErrorMessage } from '../utils/apiError';

/** TA grades waiting for a lecturer or admin (UX-002), one server page at a time. `total` is the server count. */
export function usePendingTaGrades(enabled: boolean, page = 1, limit = 20) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await submissionsService.getAll({ gradeStatus: 'pending_approval', page, limit });
      setSubmissions(result.submissions);
      setPagination(result.pagination);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load TA grades to approve.'));
    }
  }, [enabled, page, limit]);

  useEffect(() => { void reload(); }, [reload]);

  return { submissions, pagination, total: pagination?.total ?? 0, error, reload };
}
