import { rolesText } from '../utils/rolePresentation';
/**
 * GlobalSearchBar — Ctrl+K / Cmd+K command palette for unified search.
 * Renders in the Layout navbar. Results grouped by type.
 */

import { useEffect, useState, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { searchService, type SearchResults } from '../services/searchService';
import { Search, BookOpen, Users, Award, FileQuestion, X, Loader2 } from 'lucide-react';
import { availableWorkspaces, canAccessPath } from '../utils/authorization';

const GlobalSearchBar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
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
      const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      inputRef.current?.focus();
      return () => {
        if (previous?.isConnected) previous.focus();
        else triggerRef.current?.focus();
      };
    } else {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  const keepDialogFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

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

  const workspaces = availableWorkspaces(user);
  const coursePath = (id: string) => workspaces.includes('lecturer') ? `/lecturer/courses/${id}`
    : canAccessPath(user, '/admin/course') ? `/admin/course?course=${id}`
    : workspaces.includes('student') ? `/student/course?course=${id}` : null;
  const credentialPath = canAccessPath(user, '/admin/certificates') ? '/admin/certificates'
    : canAccessPath(user, '/student/badges') ? '/student/badges' : null;
  const quizPath = canAccessPath(user, '/admin/quizzes') ? '/admin/quizzes'
    : canAccessPath(user, '/student/quizzes') ? '/student/quizzes' : null;

  const totalResults = results
    ? Object.values(results.counts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="global-search-dialog"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 hover:bg-white hover:border-neutral-300 transition-colors"
        data-testid="search-trigger"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-neutral-300 bg-white px-1.5 text-[10px] font-medium text-neutral-500">
          ⌘K
        </kbd>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 bg-neutral-900/40 z-[60]" aria-hidden onClick={() => setOpen(false)} data-testid="search-overlay" />
          <div id="global-search-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Search" onKeyDown={keepDialogFocus} className="fixed top-[10%] left-1/2 -translate-x-1/2 w-[calc(100%_-_2rem)] max-w-lg z-[61] bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden" data-testid="search-modal">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100">
              <Search className="h-5 w-5 text-neutral-400 shrink-0" aria-hidden />
              <input
                ref={inputRef}
                type="text"
                aria-label="Search courses, certificates, and more"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses, certificates, and more..."
                className="min-w-0 flex-1 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
                data-testid="search-input"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
              <button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100">
                <X className="h-4 w-4" aria-hidden />
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
                    <button key={c.id} type="button" disabled={!coursePath(c.id)} onClick={() => { const path = coursePath(c.id); if (path) navigateTo(path); }}
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
                    <button key={u.id} type="button" onClick={() => navigateTo(`/profile/${u.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-user">
                      <Users className="h-4 w-4 text-green-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-800 truncate">{u.name}</p>
                        <p className="text-xs text-neutral-500 truncate">{u.email} &middot; {rolesText(u)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results?.results.credentials && results.results.credentials.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Certificates</p>
                  {results.results.credentials.map((cr) => (
                    <button key={cr.id} type="button" disabled={!credentialPath} onClick={() => { if (credentialPath) navigateTo(credentialPath); }}
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
                    <button key={qz.id} type="button" disabled={!quizPath} onClick={() => { if (quizPath) navigateTo(quizPath); }}
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
      )}
    </>
  );
};

export default GlobalSearchBar;
