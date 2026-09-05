# Frontend Performance Baseline

## Context

- Recorded on: 2026-09-05
- Repository SHA: be8dce2
- Deployed web build SHA: f63124cfb5bf2ee952029af4bf9f394dd1f34c15
- Build tool: Vite (code-split output)
- Frontend framework: React 18 + TypeScript

## Lighthouse Scores

Lighthouse requires Chrome/Chromium which is not available on the production server.
Run locally or in CI against the deployed frontend.

```bash
npx lighthouse https://lms.smwebsystems.com \
  --chrome-flags="--headless --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=lighthouse-report.json
```

| Page | Performance | Accessibility | Best Practices | SEO |
|------|-------------|---------------|----------------|-----|
| Login (`/`) | TBD | TBD | TBD | TBD |
| Student Dashboard (`/student`) | TBD | TBD | TBD | TBD |
| Course Viewer (`/student/course/:id`) | TBD | TBD | TBD | TBD |
| Quiz (`/student/quizzes`) | TBD | TBD | TBD | TBD |
| Admin Dashboard (`/admin`) | TBD | TBD | TBD | TBD |

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
| Lighthouse Performance | TBD | >= 90 |
| Lighthouse Accessibility | TBD | >= 95 |
| Largest route chunk (raw) | 67.5 KB | < 80 KB |

## Observations

1. **Code splitting is effective.** Vite produces 54 route-level chunks, keeping initial load to ~107 KB gzip.
2. **React vendor chunk is the largest single file** (51.9 KB gzip). This is expected for React 18.
3. **CSS is well-compressed** (94.2 KB raw -> 14.5 KB gzip, 84% compression).
4. **AdminCourse and AdminDashboard are the heaviest route chunks** (~63-68 KB raw each). These are admin-only routes loaded on demand.
5. **No Chrome on production server** prevents Lighthouse audits. Recommend adding Lighthouse CI in GitHub Actions.

## Future Work

- [ ] Add Lighthouse CI to GitHub Actions (requires Chrome in CI environment).
- [ ] Set up automated bundle size tracking (e.g., `size-limit` or Vite build reporter).
- [ ] Monitor for bundle size regressions on PRs.
- [ ] Profile AdminCourse and AdminDashboard chunks for potential splitting.
- [ ] Evaluate tree-shaking of `lucide-react` icons (often a hidden bundle cost).
