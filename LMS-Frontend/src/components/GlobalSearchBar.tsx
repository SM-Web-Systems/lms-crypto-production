/**
 * GlobalSearchBar — Ctrl+K / Cmd+K command palette for unified search.
 * Renders in the Layout navbar. Results grouped by type.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { searchService, type SearchResults } from '../services/searchService';
import { Search, BookOpen, Users, Award, FileQuestion, X, Loader2 } from 'lucide-react';

const GlobalSearchBar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Ctrl+K / Cmd+K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const data = await searchService.search(q.trim());
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const navigateTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const rolePrefix = user?.role === 'admin' ? '/admin' : user?.role === 'lecturer' ? '/lecturer' : '/student';

  const totalResults = results
    ? Object.values(results.counts).reduce((a, b) => a + b, 0)
    : 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 hover:bg-white hover:border-neutral-300 transition-colors"
        data-testid="search-trigger"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-neutral-300 bg-white px-1.5 text-[10px] font-medium text-neutral-500">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-neutral-900/40 z-[60]" onClick={() => setOpen(false)} data-testid="search-overlay" />
      <div className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[61] bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden" data-testid="search-modal">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100">
          <Search className="h-5 w-5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses, certificates, and more..."
            className="flex-1 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
            data-testid="search-input"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!results && !loading && query.length < 2 && (
            <p className="text-sm text-neutral-500 text-center py-8">Type to search across courses, certificates, and more</p>
          )}

          {results && totalResults === 0 && (
            <p className="text-sm text-neutral-500 text-center py-8">No results found for &ldquo;{results.query}&rdquo;</p>
          )}

          {results?.results.courses && results.results.courses.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Courses</p>
              {results.results.courses.map((c) => (
                <button key={c.id} type="button" onClick={() => navigateTo(
                    user?.role === 'lecturer' ? `/lecturer/courses/${c.id}` : `${rolePrefix}/course?course=${c.id}`
                  )}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-course">
                  <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{c.title}</p>
                    <p className="text-xs text-neutral-500 truncate">{c.courseCode}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results?.results.users && results.results.users.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Users</p>
              {results.results.users.map((u) => (
                <button key={u.id} type="button" onClick={() => navigateTo('/admin/students')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-user">
                  <Users className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{u.name}</p>
                    <p className="text-xs text-neutral-500 truncate">{u.email} &middot; {u.role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results?.results.credentials && results.results.credentials.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Certificates</p>
              {results.results.credentials.map((cr) => (
                <button key={cr.id} type="button" onClick={() => navigateTo(`${rolePrefix}/badges`)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-credential">
                  <Award className="h-4 w-4 text-purple-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{cr.courseTitle}</p>
                    <p className="text-xs text-neutral-500 truncate">{cr.studentName} &middot; {cr.issuedAt}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results?.results.quizzes && results.results.quizzes.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Quizzes</p>
              {results.results.quizzes.map((qz) => (
                <button key={qz.id} type="button" onClick={() => navigateTo(`${rolePrefix}/quizzes`)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-quiz">
                  <FileQuestion className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{qz.title}</p>
                    <p className="text-xs text-neutral-500 truncate">{qz.courseTitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default GlobalSearchBar;
