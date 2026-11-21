import { useCallback, useEffect, useRef, useState } from 'react';
import { submissionsService } from '../services/submissionsService';
import type { Pagination, Submission } from '../types/api';
import { getErrorMessage } from '../utils/apiError';

/** TA grades waiting for a lecturer or admin (UX-002), one server page at a time. `total` is the server count. */
export function usePendingTaGrades(enabled: boolean, page = 1, limit = 20) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0); // only the latest request may set state

  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    setLoading(true);
    try {
      const result = await submissionsService.getAll({ gradeStatus: 'pending_approval', page, limit });
      if (id !== request.current) return;
      setSubmissions(result.submissions);
      setPagination(result.pagination);
      setError(null);
    } catch (err) {
      if (id === request.current) setError(getErrorMessage(err, 'Could not load TA grades to approve.'));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [enabled, page, limit]);

  useEffect(() => { void reload(); }, [reload]);

  return { submissions, pagination, total: pagination?.total ?? 0, loading, error, reload };
}
