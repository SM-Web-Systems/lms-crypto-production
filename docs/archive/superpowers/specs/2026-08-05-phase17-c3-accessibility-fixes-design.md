# Phase 17 C3: Accessibility Fixes — Design Spec

**Date:** 2026-08-06
**Author:** Claude Opus 4.6
**Baseline:** 639 tests (553 BE + 86 FE), all passing
**Source:** Phase 15 C1 Browser QA Sweep (QA-003–QA-016)

---

## Problem

Phase 15 C1 identified 14 accessibility/UX issues across 10 frontend components (QA-003 through QA-016). All were deferred as non-blocking. This phase resolves 12 of them and defers 2 accepted-risk items.

## Scope

- **Frontend only** — no backend, no schema, no API changes
- **9 files modified** — existing components only, no new files
- **0 new tests** — fixes are additive HTML/ARIA attributes and event handlers; existing tests remain at 639
- **12 issues fixed, 2 deferred**

## Issue Inventory

### Critical (Keyboard + Screen Reader)

| ID | Component | Issue | Fix |
|----|-----------|-------|-----|
| QA-004 | TierSelector, BadgeDisplay | Modal overlays lack `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Escape key handler | Add dialog ARIA attributes + `onKeyDown` Escape handler to both modal wrappers |
| QA-005 | NotificationBell | Dropdown lacks `aria-expanded`, `role="menu"`, Escape key handler | Add `aria-expanded={open}` to bell button, `role="menu"` + `aria-label` to dropdown, Escape key handler |

### Medium (Form Labels)

| ID | Component | Issue | Fix |
|----|-----------|-------|-----|
| QA-003 | PricingManagement | `<label>` elements not linked to inputs via `htmlFor`/`id` | Add matching `htmlFor`/`id` pairs: `pricing-price`, `pricing-tier`, `pricing-xlm`, `pricing-usdc` |
| QA-006 | InlineAssignmentForm | Title and file inputs have no `<label>` elements | Add visually-hidden `<label>` elements with `htmlFor`/`id` pairs |
| QA-007 | CohortManagement | CreateCohortModal `<label>` elements not linked to inputs via `htmlFor`/`id` | Add matching `htmlFor`/`id` pairs: `cohort-name`, `cohort-course`, `cohort-tier` |

### Low (Icons, Clipboard, Error Handling)

| ID | Component | Issue | Fix |
|----|-----------|-------|-----|
| QA-008 | StatusBadge | Icons (CheckCircle, XCircle, Clock) lack `aria-hidden` | Add `aria-hidden="true"` to all 3 icon instances |
| QA-009 | StudentWalletStatusCard | AlertCircle icons missing `aria-hidden` | Add `aria-hidden="true"` to AlertCircle icons (lines 44, 67) and other decorative icons |
| QA-010 | PaymentCheckout | Copy buttons lack `aria-label`; shared `loading` state shows spinners on all buttons | Add `aria-label` to copy buttons; split loading into per-action state (`loadingMethod`) |
| QA-011 | PaymentCheckout | `navigator.clipboard.writeText` missing try/catch | Wrap in try/catch, silently catch (best-effort copy) |
| QA-012 | TierSelector | On API error, modal silently returns null (no user feedback) | Add error state; show error message with retry/cancel instead of returning null |
| QA-015 | AnnouncementsPanel | Course fetch delay before modal open (no loading indicator) | Add `courseLoading` state; show spinner while courses load before opening modal |
| QA-016 | AnnouncementsPanel | `alert()` for delete errors (inconsistent with inline error pattern) | Replace `alert()` with `setError()` inline error display |

### Deferred (Accepted Risk / Not A11y)

| ID | Component | Issue | Reason |
|----|-----------|-------|--------|
| QA-013 | BadgeDisplay | `dangerouslySetInnerHTML` for SVG | Accepted risk — SVG is server-generated, not user-supplied |
| QA-014 | SponsorDashboard | setState side-effect in toggleRow (async fetch inside setState) | Anti-pattern but works correctly in production; not an accessibility issue |

## Fix Details

### QA-003: PricingManagement form labels

Add `id` attributes to inputs and `htmlFor` to labels in the edit modal:

```tsx
<label htmlFor="pricing-price" className="...">Price (USD)</label>
<input id="pricing-price" type="number" ... />

<label htmlFor="pricing-tier" className="...">Tier Mode</label>
<select id="pricing-tier" ... />

<label htmlFor="pricing-xlm" className="...">Stellar XLM Price</label>
<input id="pricing-xlm" type="number" ... />

<label htmlFor="pricing-usdc" className="...">Stellar USDC Price</label>
<input id="pricing-usdc" type="number" ... />
```

### QA-004: TierSelector + BadgeDisplay dialog ARIA

Add to both modal wrapper divs:
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing to the `<h3>` id
- `onKeyDown` handler that calls `onCancel`/close on Escape

TierSelector modal:
```tsx
<div className="fixed inset-0 ..." role="dialog" aria-modal="true" aria-labelledby="tier-dialog-title"
     onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
  <div className="bg-white ...">
    <h3 id="tier-dialog-title" ...>Choose Certificate Type</h3>
```

BadgeDisplay preview modal:
```tsx
<div className="fixed inset-0 ..." role="dialog" aria-modal="true" aria-labelledby="badge-dialog-title"
     onKeyDown={(e) => { if (e.key === 'Escape') setShowPreview(false); }}>
  <div className="bg-white ...">
    <h3 id="badge-dialog-title" ...>Your Certificate Badge</h3>
```

### QA-005: NotificationBell dropdown ARIA

- Add `aria-expanded={open}` to the bell `<button>`
- Add `role="menu"` and `aria-label="Notifications"` to the dropdown div
- Add `role="menuitem"` to each notification button
- Add Escape key handler to close dropdown

```tsx
<button aria-label="Notifications" aria-expanded={open} aria-haspopup="true" ...>

// In useEffect or onKeyDown on the dropdown container:
if (e.key === 'Escape') setOpen(false);
```

### QA-006: InlineAssignmentForm labels

Add `<label>` elements (visually hidden via `sr-only` class) with proper linking:

```tsx
<label htmlFor="assignment-title" className="sr-only">Submission title</label>
<input id="assignment-title" type="text" ... />

<label htmlFor="assignment-file" className="sr-only">Upload file</label>
<input id="assignment-file" type="file" ... />
```

### QA-007: CohortManagement form labels

Add `htmlFor`/`id` pairs in CreateCohortModal:

```tsx
<label htmlFor="cohort-name" ...>Name</label>
<input id="cohort-name" ... />

<label htmlFor="cohort-course" ...>Course</label>
<select id="cohort-course" ... />
```

### QA-008: StatusBadge icon aria-hidden

Add `aria-hidden="true"` to all three icon instances:

```tsx
<CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
<XCircle className="h-3 w-3 mr-1" aria-hidden="true" />
<Clock className="h-3 w-3 mr-1" aria-hidden="true" />
```

### QA-009: StudentWalletStatusCard icon aria-hidden

Add `aria-hidden="true"` to all decorative icons (AlertCircle, Wallet, CheckCircle, Copy, ExternalLink).

### QA-010 + QA-011: PaymentCheckout

**QA-010:** Add `aria-label` to copy buttons:
```tsx
<button aria-label="Copy destination address" ...>
<button aria-label="Copy memo" ...>
```

Split `loading` into `loadingMethod: string | null` to show spinner only on the clicked button:
```tsx
const [loadingMethod, setLoadingMethod] = useState<string | null>(null);
// Use setLoadingMethod('paystack') / setLoadingMethod('xlm') etc.
// Check loadingMethod === 'paystack' for individual spinner
```

**QA-011:** Wrap clipboard call in try/catch:
```tsx
const copyToClipboard = async (text: string, field: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // best-effort — clipboard API may be denied
  }
  setCopiedField(field);
  setTimeout(() => setCopiedField(null), 2000);
};
```

### QA-012: TierSelector error state

Add error state and display:
```tsx
const [error, setError] = useState(false);

// In catch:
.catch(() => { setTierInfo(null); setError(true); })

// Instead of returning null on error:
if (error) {
  return (
    <div className="fixed inset-0 ..." role="dialog" ...>
      <div className="bg-white ...">
        <p className="text-sm text-red-600">Failed to load tier options.</p>
        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
```

### QA-015: AnnouncementsPanel course loading

Add `courseLoading` state:
```tsx
const [courseLoading, setCourseLoading] = useState(false);

const openCreate = async () => {
  // ...
  if (courses.length === 0) {
    setCourseLoading(true);
    const list = await courseService.fetchCourses().catch(() => []);
    setCourses(list);
    setCourseLoading(false);
  }
  setModalOpen(true);
};
```

Show a spinner button while loading:
```tsx
<Button onClick={() => void openCreate()} disabled={courseLoading}>
  {courseLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden /> : <Plus ... />}
  {courseLoading ? 'Loading…' : 'New announcement'}
</Button>
```

### QA-016: AnnouncementsPanel inline error

Replace `alert('Failed to delete announcement')` with:
```tsx
} catch {
  setError('Failed to delete announcement');
}
```

This reuses the existing `error` state and inline error display already in the component.

## Verification Gates

1. TypeScript: `cd LMS-Frontend && npx tsc --noEmit`
2. Backend tests: `cd LMS-Server && npx vitest run` (553/553 expected)
3. Frontend tests: `cd LMS-Frontend && npx vitest run` (86/86 expected)
4. Vite build: `cd LMS-Frontend && npx vite build`
5. Docker build: `docker compose build web`
6. Smoke: HTTP 200 on health endpoint

## Rollback

All fixes are additive frontend-only changes (HTML attributes, event handlers, state variables). Safe rollback via `git revert`. No schema, no backend, no breaking changes.
