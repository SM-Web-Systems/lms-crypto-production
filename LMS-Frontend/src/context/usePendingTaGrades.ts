import { useCallback, useEffect, useState } from 'react';
import { submissionsService } from '../services/submissionsService';
import type { Submission } from '../types/api';
import { getErrorMessage } from '../utils/apiError';

/** TA grades waiting for a lecturer or admin (UX-002). `total` is the server count, not the rows loaded. */
export function usePendingTaGrades(enabled: boolean, limit = 100) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const page = await submissionsService.getAll({ gradeStatus: 'pending_approval', limit });
      setSubmissions(page.submissions);
      setTotal(page.pagination.total);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load TA grades to approve.'));
    }
  }, [enabled, limit]);

  useEffect(() => { void reload(); }, [reload]);

  return { submissions, total, error, reload };
}
