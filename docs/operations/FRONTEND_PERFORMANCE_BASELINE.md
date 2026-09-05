# Frontend Performance Baseline

## Context

- Recorded on: 2026-09-05 (bundle sizes), updated 2026-09-05 (TTFB metrics)
- Repository SHA: 311d8e6 (deployed)
- Deployed web build SHA: 311d8e6
- Build tool: Vite (code-split output)
- Frontend framework: React 18 + TypeScript

## Server-Side Response Metrics

Measured from production server using curl (same-host, minimal network latency).
Recorded: 2026-09-05T17:48:03Z.

| Endpoint | TTFB | Total | Size | Status |
|----------|------|-------|------|--------|
| `/` (SPA shell) | 40ms | 40ms | 1.5 KB | 200 |
| `/api/v1/health` | 63ms | 63ms | 293 B | 200 |
| `/api/v1/courses` (unauth) | 69ms | 69ms | 101 B | 401 |
| `vendor-react-CdyKF4gv.js` | 52ms | 54ms | 159 KB | 200 |

All TTFB values under 70ms (same-host). External client latency will add network RTT.

## Lighthouse Scores

**Status: Blocked** — No Chrome/Chromium available on production server.

To record Lighthouse scores, run from a machine with Chrome:

```bash
npx lighthouse https://lms.smwebsystems.com \
  --chrome-flags="--headless --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=lighthouse-report.json
```

Or add Lighthouse CI to GitHub Actions (see Future Work).

| Page | Performance | Accessibility | Best Practices | SEO |
|------|-------------|---------------|----------------|-----|
| Login (`/`) | — | — | — | — |
| Student Dashboard (`/student`) | — | — | — | — |
| Course Viewer (`/student/course/:id`) | — | — | — | — |
| Quiz (`/student/quizzes`) | — | — | — | — |
| Admin Dashboard (`/admin`) | — | — | — | — |

## Bundle Sizes

Recorded from Vite build output (`LMS-Frontend/dist/assets/`).

### Critical Path (initial load)

| File | Raw | Gzip |
|------|-----|------|
| `index-vISg4zUZ.js` (app entry) | 139.4 KB | 40.6 KB |
| `vendor-react-CdyKF4gv.js` (React runtime) | 159.1 KB | 51.9 KB |
| `index-B3rIA1Do.css` (styles) | 94.2 KB | 14.5 KB |
| **Initial load total** | **392.7 KB** | **107.0 KB** |

### Shared Vendors

| File | Raw | Gzip |
|------|-----|------|
| `vendor-ui-ChoCd4vZ.js` (UI components) | 38.6 KB | 7.2 KB |
| `vendor-http-CunYwk-C.js` (axios/HTTP) | 36.7 KB | 14.7 KB |

### Largest Route Chunks

| File | Raw | Gzip | Route |
|------|-----|------|-------|
| `AdminCourse-DWlj_BSb.js` | 67.5 KB | — | Admin course editor |
| `AdminDashboard-De1zNTdg.js` | 62.8 KB | — | Admin dashboard |
| `StudentDashboard-DH8WgARL.js` | 35.2 KB | — | Student dashboard |
| `AdminCertificates-BTcoy8sL.js` | 32.0 KB | — | Certificate management |
| `AdminQuizzes-BJXSZLCX.js` | 29.9 KB | — | Quiz management |
| `EmbeddedMaterialViewer-fGvmIM98.js` | 28.4 KB | — | Course content viewer |
| `StudentCourse-D1eSOe0y.js` | 27.8 KB | — | Student course view |
| `SponsorDashboard-CY3W7WFf.js` | 27.0 KB | — | Sponsor portal |

### Total Bundle

| Metric | Value |
|--------|-------|
| Total files | 54 |
| Total raw size | 1,033 KB |
| Total gzip size | 288 KB |

## Targets

Future performance work should aim for:

| Metric | Current | Target |
|--------|---------|--------|
| Initial load (gzip) | 107 KB | < 120 KB (maintain) |
| Total bundle (gzip) | 288 KB | < 350 KB |
| API TTFB (same-host) | 63 ms | < 100 ms |
| Lighthouse Performance | — (no Chrome) | >= 90 |
| Lighthouse Accessibility | — (no Chrome) | >= 95 |
| Largest route chunk (raw) | 67.5 KB | < 80 KB |

## Observations

1. **Code splitting is effective.** Vite produces 54 route-level chunks, keeping initial load to ~107 KB gzip.
2. **React vendor chunk is the largest single file** (51.9 KB gzip). This is expected for React 18.
3. **CSS is well-compressed** (94.2 KB raw -> 14.5 KB gzip, 84% compression).
4. **AdminCourse and AdminDashboard are the heaviest route chunks** (~63-68 KB raw each). These are admin-only routes loaded on demand.
5. **No Chrome on production server** prevents Lighthouse audits. Recommend adding Lighthouse CI in GitHub Actions.
6. **Server-side TTFB is excellent** — all endpoints respond under 70ms from same-host. The SPA shell (`/`) serves in 40ms.

## Lighthouse CI

- **Workflow:** `.github/workflows/lighthouse.yml`
- **Schedule:** Weekly automated runs (Tuesday 6 AM UTC)
- **Trigger:** Manual workflow dispatch
- **Target:** Login page (SPA shell at `localhost:4173` via `vite preview`)
- **Thresholds:**
  - Performance: >= 70
  - Accessibility: >= 80
  - Best Practices: >= 80
  - SEO: >= 80
- **Artifacts:** JSON + HTML reports retained 30 days

Note: Thresholds are conservative initial values. Raise them as scores
are baselined (target: Performance >= 90, Accessibility >= 95).

## Future Work

- [x] Add Lighthouse CI to GitHub Actions (requires Chrome in CI environment).
- [ ] Set up automated bundle size tracking (e.g., `size-limit` or Vite build reporter).
- [ ] Monitor for bundle size regressions on PRs.
- [ ] Profile AdminCourse and AdminDashboard chunks for potential splitting.
- [ ] Evaluate tree-shaking of `lucide-react` icons (often a hidden bundle cost).
