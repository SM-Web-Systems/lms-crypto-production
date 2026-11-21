# Phase 25 C1: Badge Gallery Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a text search input to the Badge Gallery page that filters credentials by course title or code, with clear button and empty search state.

**Architecture:** Frontend-only change. Add `search` state to BadgeGallery, substring match on `courseTitle`/`courseCode`, AND with existing course filter. No backend changes.

**Tech Stack:** React, TypeScript, Tailwind CSS, vitest, @testing-library/react, lucide-react

## Global Constraints

- Frontend tests: `cd LMS-Frontend && npx vitest run`
- Frontend type check: `cd LMS-Frontend && npx tsc --noEmit`
- Production build: `cd LMS-Frontend && npx vite build`
- Existing mock: `vi.mock('../../services/courseCompletionService', ...)`

---

### Task 0: Branch Setup + Baseline

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main && git checkout -b feat/phase25-c1-badge-search
git tag pre-phase25-c1-2026-08-11
```

- [ ] **Step 2: Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-08-11-phase25-c1-badge-search-design.md \
        docs/superpowers/plans/2026-08-11-phase25-c1-badge-search-plan.md
git commit -m "docs: Phase 25 C1 badge search spec + plan"
```

---

### Task 1: Add Badge Search (TDD)

**Files:**
- Modify: `LMS-Frontend/src/pages/BadgeGallery.tsx`
- Modify: `LMS-Frontend/src/__tests__/pages/BadgeGallery.test.tsx`

- [ ] **Step 1: Write 3 failing frontend tests**

Append to `LMS-Frontend/src/__tests__/pages/BadgeGallery.test.tsx`, inside the existing `describe('BadgeGallery', ...)` block, after `GALLERY-FE-4`:

```typescript
  it('SEARCH-FE-1: search input filters by course title', async () => {
    render(
      <MemoryRouter>
        <BadgeGallery />
      </MemoryRouter>,
    );

    await screen.findAllByText('Blockchain 101');

    const searchInput = screen.getByRole('textbox', { name: /search badges/i });
    fireEvent.change(searchInput, { target: { value: 'Block' } });

    await waitFor(() => {
      expect(screen.getAllByText('Blockchain 101').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Smart Contracts')).toBeNull();
    });
  });

  it('SEARCH-FE-2: search input filters by course code', async () => {
    render(
      <MemoryRouter>
        <BadgeGallery />
      </MemoryRouter>,
    );

    await screen.findAllByText('Blockchain 101');

    const searchInput = screen.getByRole('textbox', { name: /search badges/i });
    fireEvent.change(searchInput, { target: { value: 'SVC' } });

    await waitFor(() => {
      expect(screen.getAllByText('Smart Contracts').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Blockchain 101')).toBeNull();
    });
  });

  it('SEARCH-FE-3: clear button resets search', async () => {
    render(
      <MemoryRouter>
        <BadgeGallery />
      </MemoryRouter>,
    );

    await screen.findAllByText('Blockchain 101');

    const searchInput = screen.getByRole('textbox', { name: /search badges/i });
    fireEvent.change(searchInput, { target: { value: 'Block' } });

    await waitFor(() => {
      expect(screen.queryByText('Smart Contracts')).toBeNull();
    });

    const clearBtn = screen.getByRole('button', { name: /clear search/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Blockchain 101').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Smart Contracts').length).toBeGreaterThanOrEqual(1);
    });
  });
```

- [ ] **Step 2: Run tests — expect SEARCH-FE-1/2/3 to fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/pages/BadgeGallery.test.tsx 2>&1 | tail -15
```

Expected: 3 failures — search input not found.

- [ ] **Step 3: Implement search in BadgeGallery.tsx**

In `LMS-Frontend/src/pages/BadgeGallery.tsx`:

1. Add imports: `Search, X` from lucide-react
2. Add state: `const [search, setSearch] = useState('');`
3. Add search filter logic (before course filter)
4. Add search input UI (before course dropdown)
5. Update empty state to distinguish "no matching badges" from "no badges yet"

Full implementation:

```tsx
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

  // Course dropdown filter (exact match, applied after search)
  const courseTitles = [...new Set(searched.map((c) => c.courseTitle).filter(Boolean))] as string[];

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
```

- [ ] **Step 4: Run tests — all 7 pass**

```bash
npx vitest run src/__tests__/pages/BadgeGallery.test.tsx 2>&1 | tail -10
```

Expected: 7 tests pass (4 existing + 3 new).

- [ ] **Step 5: Run full frontend suite**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  151 passed`

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/pages/BadgeGallery.tsx LMS-Frontend/src/__tests__/pages/BadgeGallery.test.tsx
git commit -m "feat(gallery): add text search to badge gallery (Phase 25 C1)"
```

---

### Task 2: Verification Gates + Merge + Closeout

- [ ] **Step 1: TypeScript check (backend + frontend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx tsc --noEmit
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

- [ ] **Step 2: Full backend tests (641/641)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run 2>&1 | grep "Tests"
```

- [ ] **Step 3: Full frontend tests (151/151)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run 2>&1 | grep "Tests"
```

- [ ] **Step 4: Vite production build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 5: Merge to main**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge --no-ff feat/phase25-c1-badge-search -m "feat: Phase 25 C1 — badge gallery search"
```

- [ ] **Step 6: Tag phase25-c1-complete-2026-08-11**

```bash
git tag phase25-c1-complete-2026-08-11
```

- [ ] **Step 7: Write closeout document**

Save to `docs/superpowers/plans/2026-08-11-phase25-c1-closeout.md`.
