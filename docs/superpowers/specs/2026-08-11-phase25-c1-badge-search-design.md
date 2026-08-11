# Phase 25 C1: Badge Gallery Search — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 25 C1
**Baseline:** 789 tests (641 BE + 148 FE)

---

## 1. Problem Statement

The Badge Gallery page (`/student/badges`) has a course filter dropdown (exact-match) and date sort toggle. Students with many certificates across multiple courses cannot quickly find a specific badge — they must scroll through the grid or use the dropdown. A text search input would allow instant filtering by course name or code.

## 2. Goals

1. Add a text search input to BadgeGallery that filters credentials by substring match on `courseTitle` and `courseCode`
2. Search works alongside the existing course filter dropdown (AND logic)
3. Debounced input to avoid excessive re-renders
4. Clear button (×) to reset search
5. Empty state when search yields no results ("No matching badges")

## 3. Non-Goals

- Backend search endpoint (client-side filtering is sufficient — credential counts per student are small)
- Search by date, wallet address, or transaction hash
- Search history or autocomplete suggestions
- Changes to the `/credentials/mine` API endpoint

## 4. Architecture

### 4.1 Frontend-Only Change

All filtering happens client-side on the already-loaded `credentials` array. No backend changes.

### 4.2 Modified Files

| File | Change |
|------|--------|
| `LMS-Frontend/src/pages/BadgeGallery.tsx` | Add search input + filter logic |
| `LMS-Frontend/src/__tests__/pages/BadgeGallery.test.tsx` | Add 3 FE tests |

### 4.3 No New Files

Search is integrated directly into the existing BadgeGallery component.

### 4.4 No Backend Changes

The `/credentials/mine` endpoint already returns `courseTitle` and `courseCode`. Client-side substring matching is sufficient.

## 5. Detailed Design

### 5.1 Search State

Add to BadgeGallery component:

```typescript
const [search, setSearch] = useState('');
```

### 5.2 Filter Logic

Search applies BEFORE the course dropdown filter (AND logic):

```typescript
const searched = search.trim()
  ? credentials.filter((c) => {
      const q = search.toLowerCase();
      return (
        (c.courseTitle ?? '').toLowerCase().includes(q) ||
        (c.courseCode ?? '').toLowerCase().includes(q)
      );
    })
  : credentials;

const filtered = filter
  ? searched.filter((c) => c.courseTitle === filter)
  : searched;
```

### 5.3 Search Input UI

Add a search input with `Search` icon (lucide-react) and clear button above the grid, alongside existing controls:

```tsx
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
```

### 5.4 Empty Search State

When search + filter yields 0 results but credentials exist, show:

```
No matching badges
Try a different search term or filter.
```

Distinguished from the "No badges yet" empty state (which means user has zero credentials).

### 5.5 Course Filter Update

The course dropdown options should be derived from the searched results (not all credentials), so filtering by course only shows courses that match the search.

## 6. Security

- No new API endpoints
- No user input sent to server
- Search is client-side only — no injection risk

## 7. Test Plan

### Frontend (3 new tests)

| ID | Test | Expected |
|----|------|----------|
| SEARCH-FE-1 | Search input filters by course title | Typing "Block" shows Blockchain 101, hides Smart Contracts |
| SEARCH-FE-2 | Search input filters by course code | Typing "SVC" shows Smart Contracts, hides Blockchain 101 |
| SEARCH-FE-3 | Clear button resets search | After clearing, all badges reappear |

### Backend (0 new tests — no backend changes)

### Target counts:
- Backend: 641 → 641 (unchanged)
- Frontend: 148 → 151 (+3)

## 8. Rollback

- Revert the merge commit or `git reset --hard pre-phase25-c1-2026-08-11`
- No new dependencies, no schema changes — clean rollback
