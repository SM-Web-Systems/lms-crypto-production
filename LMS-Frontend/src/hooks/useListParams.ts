import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PAGE_SIZES = [20, 50, 100];

type Patch = Record<string, string | number | undefined>;

/**
 * List state in the URL (`?page=&limit=&search=&status=` and friends, named as the server names them),
 * so Back and refresh keep it. Changing anything but `page` goes back to page 1.
 */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const limitParam = Number(params.get('limit'));
  const limit = PAGE_SIZES.includes(limitParam) ? limitParam : PAGE_SIZES[0];

  const update = useCallback((patch: Patch, options?: { replace?: boolean }) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      if (!('page' in patch) || next.get('page') === '1') next.delete('page');
      if (next.get('limit') === String(PAGE_SIZES[0])) next.delete('limit');
      return next;
    }, options);
  }, [setParams]);

  return { page, limit, get: (key: string) => params.get(key) ?? '', update };
}
