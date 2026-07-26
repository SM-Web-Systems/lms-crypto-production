# LMS-UX-001 NFT Badges Grid Layout Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the NFT Badges section in StudentDashboard so cards tile in a responsive 1→2→4 column grid instead of a broken single-column layout.

**Architecture:** Pure frontend CSS/layout change. Remove a redundant outer `<div>` grid wrapper, consolidate responsive grid classes onto the `<ul>`, fix a `m:` Tailwind breakpoint typo, and clean up non-interactive hover effects on the empty-state `<li>`. No backend, service, or state changes.

**Tech Stack:** React + Tailwind CSS v4 (via `@tailwindcss/vite`), Docker Compose (`docker compose build web`).

## Global Constraints

- No backend changes — frontend only.
- Do not modify `NftCard.tsx` — card internals are correct.
- Deploy ONLY via `docker compose build web && docker compose up -d --no-deps web` — never copy a local `dist/` build into the container directly (baked `VITE_API_BASE_URL` arg would be wrong).
- Test suite baseline: **293/293** vitest tests must pass after change.
- Working directory for vitest: `/home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server`
- Working directory for docker compose: `/home/webadmin/web-stack/html/LMS-AmmaWallet`

---

### Task 1: Apply layout fix to StudentDashboard.tsx

**Files:**
- Modify: `LMS-Frontend/src/pages/StudentDashboard.tsx:507–518`

**Interfaces:**
- Consumes: `nftTokens: NftToken[]` (already in component state — no changes needed)
- Produces: updated JSX for the `{/* NFT Badges */}` section

---

- [ ] **Step 1: Read the current NFT Badges block to confirm exact text before editing**

  File: `LMS-Frontend/src/pages/StudentDashboard.tsx`, lines 504–519.

  Expected current state:
  ```jsx
  {/* NFT Badges */}
  <section>
    <h2 className="text-lg font-bold text-neutral-900 mb-4">Your NFT Badges</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <ul className="grid grid-cols-1 m:grid-cols-2 gap-2 mt-2">
        {nftTokens.length > 0 ? (
          nftTokens.map((token) => (<li key={token.id}><NftCard token={token} /></li>))
        ) : (
          <li className={`group text-left rounded-xl border border-neutral-200/90 bg-gradient-to-br p-4 shadow-card ring-1 ring-neutral-900/[0.03] transition-all hover:shadow-updraft-hover hover:-translate-y-0.5 hover:ring-neutral-900/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2`}
          >
            No NFT badges yet
          </li>
        )}
      </ul>
    </div>
  </section>
  ```

- [ ] **Step 2: Apply the three-part fix**

  Replace the entire block above with:

  ```jsx
  {/* NFT Badges */}
  <section>
    <h2 className="text-lg font-bold text-neutral-900 mb-4">Your NFT Badges</h2>
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {nftTokens.length > 0 ? (
        nftTokens.map((token) => (<li key={token.id}><NftCard token={token} /></li>))
      ) : (
        <li className="col-span-full rounded-xl border border-neutral-200/90 bg-gradient-to-br p-4 shadow-card ring-1 ring-neutral-900/[0.03] text-sm text-neutral-500">
          No NFT badges yet
        </li>
      )}
    </ul>
  </section>
  ```

  Changes made:
  - **T-1:** Removed outer `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">` wrapper and its closing `</div>`.
  - **T-2:** `<ul>` now has `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"` — `m:` typo fixed to `sm:`; gap/spacing aligned to section standard.
  - **T-3:** Empty-state `<li>` has `col-span-full` added; all hover/focus classes (`group`, `transition-all`, `hover:shadow-updraft-hover`, `hover:-translate-y-0.5`, `hover:ring-neutral-900/[0.06]`, `focus:outline-none`, `focus-visible:ring-2`, `focus-visible:ring-accent-teal`, `focus-visible:ring-offset-2`) removed.

- [ ] **Step 3: Verify the file saved correctly**

  Re-read lines 504–519 and confirm the outer `<div>` is gone, `<ul>` has the correct classes, and the empty-state `<li>` starts with `col-span-full`.

---

### Task 2: Run vitest regression check

**Files:**
- No file changes — verification only.

---

- [ ] **Step 1: Run the full test suite**

  ```bash
  cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
  npx vitest run
  ```

  Expected output (last lines):
  ```
  Test Files  19 passed (19)
  Tests       293 passed (293)
  ```

  If any test fails: **stop, use systematic-debugging skill before proceeding.**

---

### Task 3: Docker build and deploy

**Files:**
- No source file changes — build and deploy only.

---

- [ ] **Step 1: Build and restart the lms-web container**

  ```bash
  cd /home/webadmin/web-stack/html/LMS-AmmaWallet
  docker compose build web && docker compose up -d --no-deps web
  ```

  Expected: build completes with no TypeScript errors; container starts healthy.

- [ ] **Step 2: Confirm container is running**

  ```bash
  docker ps | grep lms-web
  ```

  Expected: `lms-web` container status `Up`.

- [ ] **Step 3: Smoke-test the frontend is live**

  ```bash
  curl -s -o /dev/null -w "%{http_code}" https://lms.smwebsystems.com/
  ```

  Expected: `200`.

---

### Task 4: Update documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-25-ux-findings.md`

---

- [ ] **Step 1: Move LMS-UX-001 from "Open issues" to a "Fixed" section**

  In `docs/superpowers/plans/2026-07-25-ux-findings.md`, under the "Fixed in this session" table at the top, add a new row:

  ```markdown
  | LMS-UX-001: NFT Badges grid layout broken (`m:` typo + outer wrapper) | `StudentDashboard.tsx:507–518` | Removed outer `<div>` grid wrapper; moved classes to `<ul>`; fixed `m:` → `sm:` typo; empty-state `<li>` gets `col-span-full`, hover classes removed |
  ```

  Remove (or strike through) the `### LMS-UX-001` heading and body under "Open issues — lower priority".

---

## Manual Verification Checklist (post-deploy)

These must be performed in a real browser — vitest cannot verify responsive layout.

| ID | Steps | Pass criterion |
|----|-------|----------------|
| M-1 | Log in as a student with 0 NFT badges; inspect "Your NFT Badges" section | Empty state spans full row width; no hover glow on mouse-over |
| M-2 | Log in as a student with exactly 1 badge | Single card in column 1; no layout distortion; remaining columns empty |
| M-3 | Resize viewport to 640–1023 px with 2+ badges | 2-column card grid |
| M-4 | Resize viewport to ≥ 1024 px with 4+ badges | 4-column card grid, cards tile left-to-right |
| M-5 | Resize to < 640 px | Single-column stacked layout |
| M-6 | Check "LMS Certificates" section below | No visual regression; section still renders correctly |

---

## Rollback

If build or runtime issues arise:

```bash
# Revert the JSX change
# Edit StudentDashboard.tsx:504–519 back to the original block (re-add outer div, revert ul classes, revert li classes)

# Rebuild
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build web && docker compose up -d --no-deps web
```
