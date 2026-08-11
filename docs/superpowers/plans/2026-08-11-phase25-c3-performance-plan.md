# Phase 25 C3: Performance Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the 842KB single-bundle frontend to multiple chunks under 500KB each via route-based code splitting, dead code removal, and dependency cleanup.

**Architecture:** React.lazy + Suspense for 21 page components, Vite manualChunks for vendor splitting, remove 6 unused dependencies, delete dead `dotted-surface.tsx`.

**Tech Stack:** React, TypeScript, Vite, vitest, @testing-library/react

## Global Constraints

- Frontend tests: `cd LMS-Frontend && npx vitest run`
- Frontend type check: `cd LMS-Frontend && npx tsc --noEmit`
- Production build: `cd LMS-Frontend && npx vite build`
- No backend changes in this phase
- Existing test count: 796 (645 BE + 151 FE)

---

### Task 0: Branch Setup + Baseline

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main && git checkout -b feat/phase25-c3-performance
git tag pre-phase25-c3-2026-08-11
```

- [ ] **Step 2: Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-08-11-phase25-c3-performance-design.md \
        docs/superpowers/plans/2026-08-11-phase25-c3-performance-plan.md
git commit -m "docs: Phase 25 C3 performance optimization spec + plan"
```

- [ ] **Step 3: Record baseline bundle size**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vite build 2>&1 | grep -E "dist/assets.*\.js"
```

Expected: Single `index-*.js` at ~842KB.

---

### Task 1: Dead Code + Dependency Cleanup

**Files:**
- Delete: `LMS-Frontend/src/components/ui/dotted-surface.tsx`
- Modify: `LMS-Frontend/package.json`

- [ ] **Step 1: Delete dead component**

Delete `LMS-Frontend/src/components/ui/dotted-surface.tsx` (unused — imports `three` and `next-themes`).

- [ ] **Step 2: Remove unused dependencies**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npm uninstall three @types/three motion next-themes @radix-ui/react-slot class-variance-authority
```

- [ ] **Step 3: Move @types/qrcode to devDependencies**

```bash
npm uninstall @types/qrcode && npm install -D @types/qrcode
```

- [ ] **Step 4: Add rollup-plugin-visualizer**

```bash
npm install -D rollup-plugin-visualizer
```

- [ ] **Step 5: Verify TypeScript still passes**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Verify build still works**

```bash
npx vite build 2>&1 | grep -E "dist/assets.*\.js"
```

Expected: Bundle should already be smaller (three.js removed).

- [ ] **Step 7: Verify tests still pass**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  151 passed`

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add -A LMS-Frontend/src/components/ui/dotted-surface.tsx LMS-Frontend/package.json LMS-Frontend/package-lock.json
git commit -m "chore: remove dead code and 6 unused dependencies (Phase 25 C3)"
```

---

### Task 2: Vite Build Config + Code Splitting

**Files:**
- Modify: `LMS-Frontend/vite.config.ts`
- Modify: `LMS-Frontend/src/App.tsx`

- [ ] **Step 1: Update vite.config.ts with manualChunks and visualizer**

Update `LMS-Frontend/vite.config.ts`:

```typescript
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const extraAllowedHosts =
  process.env.VITE_DEV_ALLOWED_HOSTS?.split(',')
    .map((h) => h.trim())
    .filter(Boolean) ?? []

const allowedHosts = [
  'localhost',
  '.localhost',
  '127.0.0.1',
  'lms.smwebsystems.com',
  ...extraAllowedHosts,
]

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.ANALYZE === 'true'
      ? [visualizer({ open: true, gzipSize: true, filename: 'dist/bundle-stats.html' })]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
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
  server: {
    host: true,
    strictPort: false,
    allowedHosts,
  },
  preview: {
    host: true,
    strictPort: false,
    port: 5173,
    allowedHosts,
  },
})
```

- [ ] **Step 2: Convert App.tsx to use React.lazy for 21 page components**

Replace the 21 eager page imports (lines 13-38) with `React.lazy()` calls, keeping eager imports for Login, SignUp, Landing, ForgotPassword, ResetPassword, SsoCallback, CertificateVerification (public/auth pages).

```typescript
import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Landing from './pages/Landing';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import SsoCallback from './pages/SsoCallback';
import CertificateVerification from './pages/CertificateVerification';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from './components/ToastProvider';

// Lazy-loaded pages — split into separate chunks per route
const Messages = React.lazy(() => import('./pages/Messages'));
const Profile = React.lazy(() => import('./pages/Profile'));
const CourseMembers = React.lazy(() => import('./pages/CourseMembers'));
const StudentDashboard = React.lazy(() => import('./pages/StudentDashboard'));
const StudentSubmissions = React.lazy(() => import('./pages/StudentSubmissions'));
const StudentPayments = React.lazy(() => import('./pages/StudentPayments'));
const BadgeGallery = React.lazy(() => import('./pages/BadgeGallery'));
const StudentDocuments = React.lazy(() => import('./pages/StudentDocuments'));
const StudentCourse = React.lazy(() => import('./pages/StudentCourse'));
const Forum = React.lazy(() => import('./pages/Forum'));
const StudentQuizzes = React.lazy(() => import('./pages/StudentQuizzes'));
const StudentProgress = React.lazy(() => import('./pages/StudentProgress'));
const NotificationSettings = React.lazy(() => import('./pages/NotificationSettings'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const AdminStudents = React.lazy(() => import('./pages/AdminStudents'));
const AdminSubmissions = React.lazy(() => import('./pages/AdminSubmissions'));
const AdminDocuments = React.lazy(() => import('./pages/AdminDocuments'));
const AdminCourse = React.lazy(() => import('./pages/AdminCourse'));
const AdminQuizzes = React.lazy(() => import('./pages/AdminQuizzes'));
const AdminCertificates = React.lazy(() => import('./pages/AdminCertificates'));
const SponsorDashboard = React.lazy(() => import('./pages/SponsorDashboard'));
const LecturerDashboard = React.lazy(() => import('./pages/LecturerDashboard'));
const LecturerCourseStudents = React.lazy(() => import('./pages/LecturerCourseStudents'));
const LecturerSubmissions = React.lazy(() => import('./pages/LecturerSubmissions'));
```

Then wrap the `<Routes>` block inside `<Suspense fallback={<LoadingScreen />}>`:

```tsx
function App() {
  return (
    <ThemeProvider>
    <Router>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <Suspense fallback={<LoadingScreen />}>
            <Routes>
            {/* ... all routes unchanged ... */}
            </Routes>
            </Suspense>
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </Router>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Verify TypeScript passes**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

- [ ] **Step 4: Verify build produces multiple chunks**

```bash
npx vite build 2>&1 | grep -E "dist/assets.*\.js"
```

Expected: Multiple JS files, largest < 500KB.

- [ ] **Step 5: Verify tests pass**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  151 passed`

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/vite.config.ts LMS-Frontend/src/App.tsx
git commit -m "feat(perf): route-based code splitting + vendor chunking (Phase 25 C3)"
```

---

### Task 3: Lazy Loading Test (TDD)

**Files:**
- Create: `LMS-Frontend/src/__tests__/lazy-loading.test.tsx`

- [ ] **Step 1: Write 1 failing test**

Create `LMS-Frontend/src/__tests__/lazy-loading.test.tsx`:

```typescript
/**
 * lazy-loading.test.tsx — Phase 25 C3
 *
 * PERF-FE-1: Lazy-loaded page renders after Suspense resolves
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React, { Suspense } from 'react';

describe('Lazy loading (Phase 25 C3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('PERF-FE-1: lazy-loaded BadgeGallery renders after Suspense resolves', async () => {
    // Mock the service before importing the lazy component
    vi.mock('../../services/courseCompletionService', () => ({
      courseCompletionService: {
        getMyCredentials: vi.fn().mockResolvedValue([]),
      },
    }));

    const BadgeGallery = React.lazy(() => import('../../pages/BadgeGallery'));

    render(
      <MemoryRouter>
        <Suspense fallback={<div>Loading...</div>}>
          <BadgeGallery />
        </Suspense>
      </MemoryRouter>,
    );

    // Suspense fallback should appear first
    expect(screen.getByText('Loading...')).toBeTruthy();

    // After lazy load resolves, the component renders
    await waitFor(() => {
      expect(screen.getByText('My Badges')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run test — expect pass (lazy loading already works)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/lazy-loading.test.tsx 2>&1 | tail -10
```

Note: This test should pass immediately since `React.lazy` works in test environments. If it fails, debug and fix.

- [ ] **Step 3: Run full frontend suite**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  152 passed`

- [ ] **Step 4: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/__tests__/lazy-loading.test.tsx
git commit -m "test(perf): lazy loading regression test (Phase 25 C3)"
```

---

### Task 4: Verification Gates + Merge + Closeout

- [ ] **Step 1: TypeScript check (backend + frontend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx tsc --noEmit
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

- [ ] **Step 2: Full backend tests (645/645)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run 2>&1 | grep "Tests"
```

- [ ] **Step 3: Full frontend tests (152/152)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run 2>&1 | grep "Tests"
```

- [ ] **Step 4: Vite production build + bundle size check**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vite build 2>&1 | grep -E "dist/assets.*\.js"
```

Expected: Multiple chunks, largest < 500KB.

- [ ] **Step 5: Merge to main**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge --no-ff feat/phase25-c3-performance -m "feat: Phase 25 C3 — performance optimization (code splitting + dependency cleanup)"
```

- [ ] **Step 6: Tag phase25-c3-complete-2026-08-11**

```bash
git tag phase25-c3-complete-2026-08-11
```

- [ ] **Step 7: Write closeout document**

Save to `docs/superpowers/plans/2026-08-11-phase25-c3-closeout.md`.
