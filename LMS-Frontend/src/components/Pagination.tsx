import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import Button from './Button';
import { PAGE_SIZES } from '../hooks/useListParams';
import type { Pagination as PageInfo } from '../types/api';

/** Previous / "Page 2 of 3" / Next, plus rows per page. Uses the server's page info. */
export function Pagination({ pagination, onPage, onLimit, disabled }: {
  pagination: PageInfo | null | undefined;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
  disabled?: boolean;
}) {
  if (!pagination || pagination.total === 0) return null;
  const pages = Math.max(1, pagination.totalPages);
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        Rows per page
        <select
          aria-label="Rows per page"
          value={pagination.limit}
          onChange={(e) => onLimit(Number(e.target.value))}
          className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="min-h-[44px]" aria-label="Previous page"
          disabled={disabled || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          Previous
        </Button>
        <span className="text-sm text-gray-600 tabular-nums">Page {pagination.page} of {pages}</span>
        <Button variant="outline" size="sm" className="min-h-[44px]" aria-label="Next page"
          disabled={disabled || pagination.page >= pages} onClick={() => onPage(pagination.page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}

/** Placeholder table rows while the next page loads. */
export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} data-testid="row-skeleton" aria-hidden>
          <td colSpan={cols} className="px-5 py-4"><div className="h-9 rounded bg-gray-100 animate-pulse" /></td>
        </tr>
      ))}
    </>
  );
}

/** A search box that sends its value after the user pauses typing. */
export function SearchInput({ value, onSearch, label, placeholder }: {
  value: string;
  onSearch: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  const [text, setText] = useState(value);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onSearchRef.current(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, value]);
  return (
    <div className="relative w-full sm:w-64">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
      />
    </div>
  );
}

export default Pagination;
