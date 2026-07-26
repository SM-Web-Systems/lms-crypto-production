# LMS-UX-001 Dev Spec: NFT Badges Grid Layout Fix

**Date:** 2026-07-26
**File:** `LMS-Frontend/src/pages/StudentDashboard.tsx` (lines 504–519)
**Component:** `NftCard` (`LMS-Frontend/src/components/NftCard.tsx`)
**Effort:** S (< 30 min)
**Diagram:** `docs/diagrams/lms-nft-badges-layout.mmd`

---

## Current Behaviour (broken)

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <ul className="grid grid-cols-1 m:grid-cols-2 gap-2 mt-2">
    {/* NftCard items OR empty state */}
  </ul>
</div>
```

Two compounding bugs:

1. **Outer grid does nothing useful.** The `<ul>` is the only child of the outer
   `<div>` grid, so it always occupies a single cell (column 1 of 4 on large
   screens). The responsive columns declared on the outer div are never applied
   to individual `NftCard` items.

2. **Typo: `m:grid-cols-2` is not a Tailwind breakpoint.** The intended
   `sm:grid-cols-2` breakpoint never fires. The inner grid stays 1-column
   on every screen size.

**Net result:** Every student sees NFT badges stacked in one narrow column
regardless of screen width. The empty-state "No NFT badges yet" also renders
narrow and has hover effects suggesting it is interactive when it is not.

---

## Desired Behaviour

Single `<ul>` owns the grid; cards respond to breakpoints:

| Breakpoint | Columns |
|------------|---------|
| < 640 px   | 1       |
| 640–1023 px (`sm`) | 2 |
| ≥ 1024 px (`lg`) | 4  |

Empty state spans the full grid width and has no hover/interactive styling.

```jsx
<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {nftTokens.length > 0 ? (
    nftTokens.map((token) => <li key={token.id}><NftCard token={token} /></li>)
  ) : (
    <li className="col-span-full rounded-xl border border-neutral-200/90 bg-gradient-to-br p-4 text-sm text-neutral-500">
      No NFT badges yet
    </li>
  )}
</ul>
```

---

## Constraints

- **No backend changes.** Pure frontend layout fix.
- **Do not change `NftCard.tsx`.** Card internals are correct.
- **Keep `gap-4` consistent** with the rest of the dashboard's section spacing.
- **Do not introduce new dependencies.**

---

## Edge Cases

| Scenario | Expected layout |
|----------|----------------|
| 0 badges | Empty-state `<li>` spans all 4 columns, centred text, no hover effects |
| 1 badge  | Single card in col-1; remaining 3 cols empty (normal grid behaviour) |
| 2 badges | 2 cards side-by-side on sm+; stacked on mobile |
| 3 badges | 3 cards in a row on lg; 2+1 on sm; stacked on mobile |
| 4+ badges | 4 per row on lg; wraps naturally |
| Long token name | `NftCard` text truncates within card boundaries (no layout break) |
| Long description | `NftCard` description is `text-xs text-stellar-muted mt-1` — naturally bounded |

---

## Test Strategy

### Automated (vitest — no new tests required)
This is a pure layout change (no JS logic, no service calls, no state changes).
Run the full existing suite to confirm zero regressions:

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run
```

Expected: **293/293** pass unchanged.

### Manual (browser — required for visual verification)
After Docker rebuild of `lms-web`:

| Step | Action | Pass criterion |
|------|--------|----------------|
| M-1 | Load student dashboard with 0 NFT badges | Empty state spans full width; no hover glow |
| M-2 | Load dashboard with 1 badge | Single card in first column; no layout distortion |
| M-3 | Load dashboard with 4+ badges | Cards tile in 4-column grid on ≥1024 px viewport |
| M-4 | Resize to 640–1023 px | Cards shift to 2-column layout |
| M-5 | Resize to < 640 px | Single-column stacked layout |
| M-6 | Confirm section below (LMS Certificates) renders correctly | No visual regression |

### Docker rebuild command
```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build web && docker compose up -d --no-deps web
```

---

## TO-DO LIST

### LMS-UX-001 Steps

- [ ] **T-1** `StudentDashboard.tsx:507`
  Remove the outer `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">` wrapper.
  _Verify: `<section>` directly contains `<ul>` after edit._

- [ ] **T-2** `StudentDashboard.tsx:508`
  Change `<ul className="grid grid-cols-1 m:grid-cols-2 gap-2 mt-2">` to
  `<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">`.
  _Verify: breakpoints `sm:` and `lg:` spelled correctly; `gap-4` matches section standard._

- [ ] **T-3** `StudentDashboard.tsx:512–515`
  Add `col-span-full` to empty-state `<li>` className; remove hover/focus effects
  (`hover:shadow-updraft-hover hover:-translate-y-0.5 hover:ring-...`
  `focus:outline-none focus-visible:ring-...`) since the element is not interactive.
  _Verify: empty state spans full width at all breakpoints._

- [ ] **T-4** Run vitest suite: `cd LMS-Server && npx vitest run`
  _Verify: 293/293 pass._

- [ ] **T-5** Docker rebuild: `docker compose build web && docker compose up -d --no-deps web`
  _Verify: build succeeds with no TypeScript errors._

- [ ] **T-6** Manual browser checks M-1 through M-6 (see Test Strategy above).

- [ ] **T-7** Update `docs/superpowers/plans/2026-07-25-ux-findings.md`:
  Move LMS-UX-001 from "Open issues" to a new "Fixed" subsection.

---

## Review Note (for code review)

**Change summary:** Remove redundant outer `<div>` grid wrapper from the NFT Badges
section; consolidate responsive grid classes onto the `<ul>` itself; fix
`m:grid-cols-2` typo to `sm:grid-cols-2`; add `col-span-full` + clean up
non-interactive hover effects on the empty-state `<li>`.

**Risk:** Low. Pure CSS class change. No state, props, services, or API calls
affected. Worst case: a grid alignment difference that is immediately visible and
easily reverted.

**Rollback:** Revert the 10-line diff in `StudentDashboard.tsx`; rebuild `lms-web`.
