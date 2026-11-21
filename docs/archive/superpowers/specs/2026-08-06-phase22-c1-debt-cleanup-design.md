# Phase 22 C1: Technical Debt Cleanup — Design Spec

**Date:** 2026-08-06
**Status:** Final
**Scope:** 3 deferred QA/TS issues — no new features, no backend changes

## 1. Current State

- **Unit tests:** 700 (587 BE vitest+supertest, 113 FE vitest+RTL)
- **E2E tests:** 12 (Playwright)
- **Deferred QA:** QA-013, QA-014 (from Phase 15 C1 sweep, deferred through Phase 17 C3)
- **Pre-existing TS error:** TenantAdminPanel.tsx:187

## 2. Debt Items

### 2.1 QA-013: dangerouslySetInnerHTML in TierSelector.tsx

**File:** `LMS-Frontend/src/components/TierSelector.tsx:171`
**Issue:** `dangerouslySetInnerHTML={{ __html: badge.badgeSvg }}` renders server-generated SVG as raw HTML.
**Risk:** XSS if badge SVG content is ever compromised or user-controllable.
**Fix:** Use DOMParser to parse the SVG string, extract the `<svg>` element, and render it via a ref-based approach that avoids innerHTML.

```typescript
// Before
<div dangerouslySetInnerHTML={{ __html: badge.badgeSvg }} />

// After — parse SVG safely via DOMParser + ref
const svgRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (svgRef.current && badge.badgeSvg) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(badge.badgeSvg, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    svgRef.current.innerHTML = '';
    if (svg) svgRef.current.appendChild(svg);
  }
}, [badge.badgeSvg]);
<div ref={svgRef} className="border rounded-lg overflow-hidden" />
```

**Note:** DOMParser with `image/svg+xml` validates the SVG structure and rejects malformed content. This is safer than raw innerHTML because it only accepts valid SVG elements.

### 2.2 QA-014: setState Side-Effect in SponsorDashboard.tsx

**File:** `LMS-Frontend/src/pages/SponsorDashboard.tsx:86-117`
**Issue:** `toggleRow()` fires an async API call (`getSponsorStudents`) inside a `setExpanded()` updater function. This is a React anti-pattern — setState updaters should be pure functions.
**Risk:** Potential double-fetch in React 18 strict mode; unpredictable behavior during concurrent rendering.
**Fix:** Separate the state update from the async fetch. Toggle the expansion state first, then fetch data based on the new state.

```typescript
// Before: async fetch inside setState updater
setExpanded((prev) => {
  if (prev[courseId] !== 'loading') return prev;
  analyticsService.getSponsorStudents(courseId).then(...)  // Side effect!
  return prev;
});

// After: state toggle + conditional fetch
const toggleRow = useCallback(async (courseId: string) => {
  setExpanded((prev) => {
    if (prev[courseId]) {
      const next = { ...prev };
      delete next[courseId];
      return next;
    }
    return { ...prev, [courseId]: 'loading' };
  });
  // Fetch outside setState — check if we need to expand
  // Use a ref or check expanded state after update
}, []);
```

### 2.3 TS Error: TenantAdminPanel.tsx Button Variant

**File:** `LMS-Frontend/src/components/TenantAdminPanel.tsx:187`
**Issue:** `variant="default"` is not a valid Button variant. Valid values: `'primary' | 'secondary' | 'danger' | 'success' | 'outline'`.
**Fix:** Change `variant="default"` to `variant="primary"` (the Button component's default variant).

## 3. File Inventory

### Modified Files (3)
| File | Change |
|------|--------|
| `LMS-Frontend/src/components/TierSelector.tsx` | Replace dangerouslySetInnerHTML with DOMParser+ref |
| `LMS-Frontend/src/pages/SponsorDashboard.tsx` | Refactor toggleRow() to separate state from fetch |
| `LMS-Frontend/src/components/TenantAdminPanel.tsx` | Fix Button variant type |

### New Files (0)
No new files.

## 4. Testing

- Existing 113 FE tests must continue to pass
- No new test files required — the fixes are defensive refactors of existing working behavior
- TypeScript check (`tsc --noEmit`) must pass with zero errors (currently 1 error)

## 5. Out of Scope

- No backend changes
- No new features
- No schema changes
- No CI/CD changes
- No new E2E tests

## 6. Success Criteria

1. `tsc --noEmit` passes with zero errors (currently fails with TenantAdminPanel error)
2. 587 BE tests pass (unchanged)
3. 113 FE tests pass (unchanged)
4. 12 E2E tests unchanged
5. Vite build succeeds
6. No `dangerouslySetInnerHTML` in TierSelector.tsx
7. No async side-effects inside setState updaters in SponsorDashboard.tsx
