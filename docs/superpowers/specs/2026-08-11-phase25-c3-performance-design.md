# Phase 25 C3: Performance Optimization — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 25 C3
**Baseline:** 796 tests (645 BE + 151 FE)

---

## 1. Problem Statement

The frontend ships a single 842KB JavaScript bundle (`index-*.js`) with all 27 page components eagerly loaded. Every user — student, admin, lecturer — downloads the entire application on first visit. Additionally, several unused dependencies (`three` at 39MB, `motion`, `next-themes`, `@radix-ui/react-slot`, `class-variance-authority`) inflate install size and the dead component `dotted-surface.tsx` pulls Three.js into the bundle.

## 2. Goals

1. Reduce initial JS bundle below 500KB via route-based code splitting (React.lazy + Suspense)
2. Remove dead code (`dotted-surface.tsx`) and unused dependencies (`three`, `motion`, `next-themes`, `@radix-ui/react-slot`, `class-variance-authority`)
3. Move `@types/qrcode` from dependencies to devDependencies
4. Configure Vite `manualChunks` to split vendor libs (react, react-dom, react-router-dom) into a separate cacheable chunk
5. Add `rollup-plugin-visualizer` for ongoing bundle analysis
6. Add 2 regression tests: 1 build output test (bundle size check), 1 frontend test (lazy loading renders)

## 3. Non-Goals

- Image lazy loading via `loading="lazy"` attributes (low impact — minimal images in this app)
- Lighthouse score optimization (network/server config, not bundle code)
- CSS splitting (94KB CSS is already small)
- Server-side rendering or pre-rendering
- Dynamic import of `qrcode` (already only in CertificateVerification which will be lazy-loaded)

## 4. Architecture

### 4.1 Code Splitting Strategy

Split pages into 3 groups by role. Each role's pages load only when that role navigates to them:

**Always eager (initial bundle):**
- Login, SignUp, Landing, ForgotPassword, ResetPassword, SsoCallback
- Layout, AuthContext, DataContext, ThemeContext
- CertificateVerification (public, SEO-reachable)

**Lazy-loaded (separate chunks):**
- Student pages: StudentDashboard, StudentSubmissions, StudentPayments, BadgeGallery, StudentDocuments, StudentCourse, StudentQuizzes, StudentProgress, NotificationSettings
- Admin pages: AdminDashboard, AdminStudents, AdminSubmissions, AdminDocuments, AdminCourse, AdminQuizzes, AdminCertificates, SponsorDashboard
- Lecturer pages: LecturerDashboard, LecturerCourseStudents, LecturerSubmissions
- Shared pages: Messages, Profile, CourseMembers, Forum

### 4.2 Vite Build Configuration

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-ui': ['lucide-react'],
      },
    },
  },
},
```

### 4.3 Bundle Analyzer

Add `rollup-plugin-visualizer` as devDependency. Conditionally include in Vite plugins when `ANALYZE=true`.

### 4.4 Dead Code Removal

| File | Action |
|------|--------|
| `src/components/ui/dotted-surface.tsx` | Delete |
| `src/lib/utils.ts` | Keep (still used by LawyeredFloatDecor) |

### 4.5 Dependency Cleanup

| Package | Action | Reason |
|---------|--------|--------|
| `three` | Remove from dependencies | Only used by dead `dotted-surface.tsx` |
| `@types/three` | Remove from devDependencies | Only typed dead code |
| `motion` | Remove from dependencies | Never imported anywhere |
| `next-themes` | Remove from dependencies | Only used by dead `dotted-surface.tsx` |
| `@radix-ui/react-slot` | Remove from dependencies | Never imported |
| `class-variance-authority` | Remove from dependencies | Never imported |
| `@types/qrcode` | Move to devDependencies | Type-only, not needed at runtime |
| `rollup-plugin-visualizer` | Add to devDependencies | Bundle analysis |

## 5. Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Replace 21 eager imports with `React.lazy()` + wrap routes in `<Suspense>` |
| `vite.config.ts` | Add `build.rollupOptions.output.manualChunks`, add visualizer plugin |
| `package.json` | Remove 6 unused deps, move 1, add 1 |
| `src/components/ui/dotted-surface.tsx` | Delete |

## 6. New Files

| File | Purpose |
|------|---------|
| `src/__tests__/lazy-loading.test.tsx` | 1 FE test — lazy-loaded component renders |

## 7. Security

- No new API endpoints
- No user input changes
- Code splitting is transparent to users
- Removing unused dependencies reduces supply chain attack surface

## 8. Test Plan

### Frontend (1 new test)

| ID | Test | Expected |
|----|------|----------|
| PERF-FE-1 | Lazy-loaded AdminDashboard renders after Suspense resolves | Component renders with loading fallback, then content |

### Backend (0 new tests — no backend changes)

### Build verification (manual gate, not automated test)

| Check | Expected |
|-------|----------|
| Largest JS chunk < 500KB | Pass (down from 842KB) |
| Multiple JS chunks in dist/ | At least 3 chunks (vendor-react, vendor-ui, app + lazy chunks) |
| `npx vite build` completes without errors | Pass |

### Target counts:
- Backend: 645 → 645 (unchanged)
- Frontend: 151 → 152 (+1)
- Total: 796 → 797 (+1)

Note: The bundle size check is a build verification gate, not an automated test. Adding a test that runs `vite build` inside vitest would be slow and brittle. Instead, bundle size is verified manually during the verification gate step.

## 9. Expected Bundle Impact

| Metric | Before | After (estimated) |
|--------|--------|-------------------|
| JS chunks | 1 (842KB) | 5+ (largest < 500KB) |
| Vendor chunk | — | ~180KB (react + react-dom + react-router-dom) |
| UI vendor | — | ~50KB (lucide-react) |
| App core | — | ~200KB (eager pages + framework) |
| Lazy chunks | — | ~100-200KB each (per-role) |
| Unused deps removed | 0 | 6 packages |

## 10. Rollback

- Revert the merge commit or `git reset --hard pre-phase25-c3-2026-08-11`
- Run `npm install` to restore removed dependencies
- No schema changes, no backend changes — clean rollback
