# Phase 26 C1: Global Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified search API and global search bar (Ctrl+K) that searches across courses, users, credentials, and quizzes with RBAC filtering.

**Architecture:** Single backend endpoint `GET /api/v1/search?q=<term>` queries 4 tables using SQL LIKE and returns categorized results. Frontend `GlobalSearchBar` component mounts in the Layout navbar header with keyboard shortcut access. Results are role-filtered server-side.

**Tech Stack:** Express + better-sqlite3 (backend), React + Tailwind (frontend), vitest (tests)

## Global Constraints

- No new npm dependencies
- No schema changes — read-only queries on existing tables
- SQL parameterized queries only (no string interpolation of user input)
- Follow existing patterns: `query()`/`queryOne()` from `config/database.js`, `makeToken()` from test helpers
- All tests use vitest; frontend tests use `@testing-library/react`
- Baseline: 808 tests (652 BE + 156 FE). Target: 814 (656 BE + 158 FE)

---

## File Structure

| File | Responsibility |
|------|----------------|
| **Create:** `LMS-Server/src/routes/search.ts` | Route registration + OpenAPI annotation for `GET /search` |
| **Create:** `LMS-Server/src/controllers/searchController.ts` | Search query logic, RBAC filtering, response shaping |
| **Create:** `LMS-Server/src/__tests__/search.test.ts` | 4 backend tests |
| **Create:** `LMS-Frontend/src/components/GlobalSearchBar.tsx` | Search modal UI with keyboard shortcut |
| **Create:** `LMS-Frontend/src/services/searchService.ts` | API client for search endpoint |
| **Create:** `LMS-Frontend/src/__tests__/components/GlobalSearchBar.test.tsx` | 2 frontend tests |
| **Modify:** `LMS-Server/src/app.ts:38,255` | Import + mount search route |
| **Modify:** `LMS-Frontend/src/components/Layout.tsx:24,183` | Import + render GlobalSearchBar in header |

---

### Task 0: Branch Setup + Baseline Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-phase26-c1-global-search-design.md` (already exists)
- Modify: `docs/superpowers/plans/2026-08-11-phase26-c1-global-search-plan.md` (this file)

**Interfaces:**
- Consumes: nothing
- Produces: clean branch `feat/phase26-c1-global-search` with spec + plan committed

- [ ] **Step 1: Create feature branch and tag baseline**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git checkout -b feat/phase26-c1-global-search
git tag pre-phase26-c1-2026-08-11
```

- [ ] **Step 2: Verify baseline test counts**

```bash
cd LMS-Server && npx vitest run 2>&1 | tail -5
```
Expected: `Tests  652 passed (652)`

```bash
cd ../LMS-Frontend && npx vitest run 2>&1 | tail -5
```
Expected: `Tests  156 passed (156)`

- [ ] **Step 3: Commit spec + plan**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add docs/superpowers/specs/2026-08-11-phase26-c1-global-search-design.md \
        docs/superpowers/plans/2026-08-11-phase26-c1-global-search-plan.md
git commit -m "docs: Phase 26 C1 global search spec + plan"
```

---

### Task 1: Backend — Search Endpoint (TDD)

**Files:**
- Create: `LMS-Server/src/__tests__/search.test.ts`
- Create: `LMS-Server/src/controllers/searchController.ts`
- Create: `LMS-Server/src/routes/search.ts`
- Modify: `LMS-Server/src/app.ts`

**Interfaces:**
- Consumes: `query()` from `config/database.js`, `authenticate` from `middleware/auth.js`, `hasPermission` from `middleware/rbac.js`, `makeToken()` from test helpers
- Produces: `GET /api/v1/search?q=<term>&types=<csv>&limit=<n>` returning `{ success: true, data: { query, results: { courses, users, credentials, quizzes }, counts } }`

- [ ] **Step 1: Write the 4 failing tests**

Create `LMS-Server/src/__tests__/search.test.ts`:

```typescript
/**
 * search.test.ts — Phase 26 C1
 *
 * SRCH-BE-1: GET /search?q=<term> returns matching courses
 * SRCH-BE-2: GET /search?q=<term> as admin returns users
 * SRCH-BE-3: GET /search?q=<term> as student does NOT return users
 * SRCH-BE-4: GET /search without q returns 400
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

let adminId: string;
let adminToken: string;
let studentId: string;
let studentToken: string;
let courseId: string;

function seedSearchData() {
  adminId = uuidv4();
  studentId = uuidv4();
  courseId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Search Admin', ?, ?, 'admin')`,
  ).run(adminId, `search-admin-${adminId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Alice Blockchain', ?, ?, 'student')`,
  ).run(studentId, `alice-${studentId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Blockchain Fundamentals', 'Learn blockchain basics', 'BLK-101', '[]')`,
  ).run(courseId);

  adminToken = makeToken({ userId: adminId, email: `search-admin-${adminId}@test.com`, role: 'admin' });
  studentToken = makeToken({ userId: studentId, email: `alice-${studentId}@test.com`, role: 'student' });
}

beforeEach(() => {
  seedSearchData();
});

describe('GET /api/v1/search (Phase 26 C1)', () => {
  it('SRCH-BE-1: returns matching courses', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=blockchain')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results.courses.length).toBeGreaterThan(0);
    expect(res.body.data.results.courses[0].title).toContain('Blockchain');
    expect(res.body.data.counts.courses).toBeGreaterThan(0);
  });

  it('SRCH-BE-2: admin search returns users', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=alice')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.users.length).toBeGreaterThan(0);
    expect(res.body.data.results.users[0].name).toContain('Alice');
  });

  it('SRCH-BE-3: student search does NOT return users', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=alice')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.users).toBeUndefined();
  });

  it('SRCH-BE-4: missing q returns 400', async () => {
    const res = await request(app)
      .get('/api/v1/search')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('q');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/search.test.ts
```
Expected: 4 FAILED (404 — route not registered)

- [ ] **Step 3: Create the search controller**

Create `LMS-Server/src/controllers/searchController.ts`:

```typescript
/**
 * searchController — unified multi-entity search with RBAC filtering.
 *
 * Searches courses, users, credentials, and quizzes using SQL LIKE.
 * Results are filtered by the caller's role.
 */

import { Response } from 'express';
import { query } from '../config/database.js';
import { hasPermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';

const VALID_TYPES = ['courses', 'users', 'credentials', 'quizzes'] as const;
type SearchType = (typeof VALID_TYPES)[number];

export function globalSearch(req: AuthRequest, res: Response): void {
  const rawQ = (req.query.q as string | undefined)?.trim();
  if (!rawQ || rawQ.length < 2) {
    res.status(400).json({
      success: false,
      error: { message: 'q query parameter is required (minimum 2 characters)' },
    });
    return;
  }

  const q = rawQ.slice(0, 100);
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 5));
  const userId = req.user!.userId;
  const isAdmin = hasPermission(userId, 'user.view_all');

  // Parse requested types (default: all accessible)
  let requestedTypes: SearchType[];
  const typesParam = req.query.types as string | undefined;
  if (typesParam) {
    requestedTypes = typesParam
      .split(',')
      .map((t) => t.trim() as SearchType)
      .filter((t) => VALID_TYPES.includes(t));
  } else {
    requestedTypes = [...VALID_TYPES];
  }

  const pattern = `%${q}%`;
  const results: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  // Courses — all authenticated users can search
  if (requestedTypes.includes('courses')) {
    const courses = query<{ id: string; title: string; course_code: string; description: string }>(
      `SELECT id, title, course_code, description FROM courses
       WHERE title LIKE ? OR course_code LIKE ? OR description LIKE ?
       ORDER BY title LIMIT ?`,
      [pattern, pattern, pattern, limit],
    );
    results.courses = courses.map((c) => ({
      id: c.id,
      title: c.title,
      courseCode: c.course_code,
      description: c.description?.slice(0, 120) ?? '',
    }));
    counts.courses = courses.length;
  }

  // Users — admin only
  if (requestedTypes.includes('users') && isAdmin) {
    const users = query<{ id: string; name: string; email: string; role: string }>(
      `SELECT id, name, email, role FROM users
       WHERE name LIKE ? OR email LIKE ?
       ORDER BY name LIMIT ?`,
      [pattern, pattern, limit],
    );
    results.users = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    }));
    counts.users = users.length;
  }

  // Credentials — students see own only, admins see all
  if (requestedTypes.includes('credentials')) {
    const credParams: unknown[] = [pattern, pattern];
    let credWhere = `(c.title LIKE ? OR u.name LIKE ?) AND nc.mint_status = 'minted' AND nc.is_superseded = 0`;
    if (!isAdmin) {
      credWhere += ' AND nc.user_id = ?';
      credParams.push(userId);
    }
    credParams.push(limit);

    const creds = query<{
      id: string; course_title: string | null; student_name: string | null; created_at: string;
    }>(
      `SELECT nc.id, c.title AS course_title, u.name AS student_name, nc.created_at
       FROM nft_credentials nc
       LEFT JOIN courses c ON c.id = nc.course_id
       LEFT JOIN users u ON u.id = nc.user_id
       WHERE ${credWhere}
       ORDER BY nc.created_at DESC LIMIT ?`,
      credParams,
    );
    results.credentials = creds.map((cr) => ({
      id: cr.id,
      courseTitle: cr.course_title ?? 'Certificate',
      studentName: cr.student_name ?? 'Student',
      issuedAt: cr.created_at,
    }));
    counts.credentials = creds.length;
  }

  // Quizzes — admin sees all, students excluded for now (low value, can add later)
  if (requestedTypes.includes('quizzes') && isAdmin) {
    const quizzes = query<{ id: string; title: string; description: string | null; course_title: string | null }>(
      `SELECT q.id, q.title, q.description, c.title AS course_title
       FROM quizzes q
       LEFT JOIN courses c ON c.id = q.course_id
       WHERE q.title LIKE ? OR q.description LIKE ?
       ORDER BY q.title LIMIT ?`,
      [pattern, pattern, limit],
    );
    results.quizzes = quizzes.map((qz) => ({
      id: qz.id,
      title: qz.title,
      courseTitle: qz.course_title ?? '',
    }));
    counts.quizzes = quizzes.length;
  }

  res.json({
    success: true,
    data: { query: q, results, counts },
  });
}
```

- [ ] **Step 4: Create the search route**

Create `LMS-Server/src/routes/search.ts`:

```typescript
/**
 * Search route — Phase 26 C1.
 *
 * GET /search?q=<term>&types=<csv>&limit=<n>  — unified multi-entity search
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { globalSearch } from '../controllers/searchController.js';

const router = Router();

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Unified multi-entity search
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term (minimum 2 characters)
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: "Comma-separated entity types: courses,users,credentials,quizzes"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           maximum: 20
 *         description: Max results per type
 *     responses:
 *       '200':
 *         description: Categorized search results
 *       '400':
 *         description: Missing or invalid q parameter
 *       '401':
 *         description: Authentication required
 */
router.get('/search', authenticate, globalSearch);

export default router;
```

- [ ] **Step 5: Register route in app.ts**

Add import at line 38 (after `import ogPagesRoutes`):

```typescript
import searchRoutes from './routes/search.js';
```

Add route mount at line 255 (after `emailTemplateRoutes`):

```typescript
app.use('/api/v1', readLimiter, searchRoutes);
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/search.test.ts
```
Expected: 4 passed

- [ ] **Step 7: Run full backend suite**

```bash
npx vitest run 2>&1 | tail -5
```
Expected: `Tests  656 passed (656)`

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/__tests__/search.test.ts \
        LMS-Server/src/controllers/searchController.ts \
        LMS-Server/src/routes/search.ts \
        LMS-Server/src/app.ts
git commit -m "feat: add GET /search unified multi-entity search endpoint

TDD backend for Phase 26 C1. Searches courses, users, credentials,
quizzes with RBAC filtering. 4 new tests (SRCH-BE-1–4). 656/656 BE pass.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — GlobalSearchBar + Integration

**Files:**
- Create: `LMS-Frontend/src/services/searchService.ts`
- Create: `LMS-Frontend/src/components/GlobalSearchBar.tsx`
- Create: `LMS-Frontend/src/__tests__/components/GlobalSearchBar.test.tsx`
- Modify: `LMS-Frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/search?q=<term>` from Task 1, `api` from `services/api.ts`, `useAuth()` from `context/useAuth`, `useNavigate()` from `react-router-dom`
- Produces: `GlobalSearchBar` React component rendered in Layout header, `searchService.search(q, types?, limit?)` API method

- [ ] **Step 1: Create the search service**

Create `LMS-Frontend/src/services/searchService.ts`:

```typescript
/**
 * searchService — API client for unified search endpoint.
 */

import api from './api';

export interface SearchResults {
  query: string;
  results: {
    courses?: Array<{ id: string; title: string; courseCode: string; description: string }>;
    users?: Array<{ id: string; name: string; email: string; role: string }>;
    credentials?: Array<{ id: string; courseTitle: string; studentName: string; issuedAt: string }>;
    quizzes?: Array<{ id: string; title: string; courseTitle: string }>;
  };
  counts: Record<string, number>;
}

export const searchService = {
  async search(q: string, types?: string, limit?: number): Promise<SearchResults> {
    const params: Record<string, string> = { q };
    if (types) params.types = types;
    if (limit) params.limit = String(limit);
    const res = await api.get<{ success: boolean; data: SearchResults }>('/search', { params });
    return res.data.data;
  },
};
```

- [ ] **Step 2: Create the GlobalSearchBar component**

Create `LMS-Frontend/src/components/GlobalSearchBar.tsx`:

```typescript
/**
 * GlobalSearchBar — Ctrl+K / Cmd+K command palette for unified search.
 * Renders in the Layout navbar. Results grouped by type.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { searchService, type SearchResults } from '../services/searchService';
import { Search, BookOpen, Users, Award, FileQuestion, X, Loader2 } from 'lucide-react';

const GlobalSearchBar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Ctrl+K / Cmd+K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const data = await searchService.search(q.trim());
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const navigateTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const rolePrefix = user?.role === 'admin' ? '/admin' : user?.role === 'lecturer' ? '/lecturer' : '/student';

  const totalResults = results
    ? Object.values(results.counts).reduce((a, b) => a + b, 0)
    : 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 hover:bg-white hover:border-neutral-300 transition-colors"
        data-testid="search-trigger"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-neutral-300 bg-white px-1.5 text-[10px] font-medium text-neutral-500">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-neutral-900/40 z-[60]" onClick={() => setOpen(false)} data-testid="search-overlay" />
      <div className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[61] bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden" data-testid="search-modal">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100">
          <Search className="h-5 w-5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses, certificates, and more..."
            className="flex-1 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
            data-testid="search-input"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!results && !loading && query.length < 2 && (
            <p className="text-sm text-neutral-500 text-center py-8">Type to search across courses, certificates, and more</p>
          )}

          {results && totalResults === 0 && (
            <p className="text-sm text-neutral-500 text-center py-8">No results found for &ldquo;{results.query}&rdquo;</p>
          )}

          {results?.results.courses && results.results.courses.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Courses</p>
              {results.results.courses.map((c) => (
                <button key={c.id} type="button" onClick={() => navigateTo(`${rolePrefix}/course/${c.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-course">
                  <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{c.title}</p>
                    <p className="text-xs text-neutral-500 truncate">{c.courseCode}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results?.results.users && results.results.users.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Users</p>
              {results.results.users.map((u) => (
                <button key={u.id} type="button" onClick={() => navigateTo('/admin/students')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-user">
                  <Users className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{u.name}</p>
                    <p className="text-xs text-neutral-500 truncate">{u.email} &middot; {u.role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results?.results.credentials && results.results.credentials.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Certificates</p>
              {results.results.credentials.map((cr) => (
                <button key={cr.id} type="button" onClick={() => navigateTo(`${rolePrefix}/badges`)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-credential">
                  <Award className="h-4 w-4 text-purple-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{cr.courseTitle}</p>
                    <p className="text-xs text-neutral-500 truncate">{cr.studentName} &middot; {cr.issuedAt}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results?.results.quizzes && results.results.quizzes.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase px-2 py-1">Quizzes</p>
              {results.results.quizzes.map((qz) => (
                <button key={qz.id} type="button" onClick={() => navigateTo(`${rolePrefix}/quizzes`)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 transition-colors" data-testid="search-result-quiz">
                  <FileQuestion className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">{qz.title}</p>
                    <p className="text-xs text-neutral-500 truncate">{qz.courseTitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default GlobalSearchBar;
```

- [ ] **Step 3: Write the 2 frontend tests**

Create `LMS-Frontend/src/__tests__/components/GlobalSearchBar.test.tsx`:

```typescript
/**
 * Tests for Phase 26 C1 — GlobalSearchBar.
 *
 * SRCH-FE-1: GlobalSearchBar renders and shows results on input
 * SRCH-FE-2: GlobalSearchBar opens on Ctrl+K keyboard shortcut
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/searchService', () => ({
  searchService: {
    search: vi.fn(),
  },
}));

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: { role: 'student', name: 'Test' } }),
}));

import { searchService } from '../../services/searchService';
import GlobalSearchBar from '../../components/GlobalSearchBar';

const mockSearch = searchService.search as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

const renderBar = () =>
  render(
    <MemoryRouter>
      <GlobalSearchBar />
    </MemoryRouter>,
  );

describe('SRCH-FE-1: GlobalSearchBar renders and shows results', () => {
  it('displays search results after typing', async () => {
    mockSearch.mockResolvedValue({
      query: 'blockchain',
      results: {
        courses: [{ id: 'c1', title: 'Blockchain Fundamentals', courseCode: 'BLK-101', description: 'Learn basics' }],
        credentials: [],
      },
      counts: { courses: 1, credentials: 0 },
    });

    const user = userEvent.setup();
    renderBar();

    // Click the search trigger to open
    await user.click(screen.getByTestId('search-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toBeDefined();
    });

    // Type search query
    await user.type(screen.getByTestId('search-input'), 'blockchain');

    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeDefined();
    });

    expect(screen.getByTestId('search-result-course')).toBeDefined();
  });
});

describe('SRCH-FE-2: GlobalSearchBar opens on Ctrl+K', () => {
  it('opens search modal on Ctrl+K keyboard shortcut', async () => {
    renderBar();

    // Verify search modal is NOT visible initially
    expect(screen.queryByTestId('search-modal')).toBeNull();

    // Press Ctrl+K
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('search-modal')).toBeDefined();
    });

    expect(screen.getByTestId('search-input')).toBeDefined();
  });
});
```

- [ ] **Step 4: Integrate GlobalSearchBar into Layout**

In `LMS-Frontend/src/components/Layout.tsx`, add import after line 24 (after `NotificationBell` import):

```typescript
import GlobalSearchBar from './GlobalSearchBar';
```

Add `<GlobalSearchBar />` inside the header, replacing the empty flex spacer at line 182. Change:

```typescript
          <div className="flex-1 lg:flex-none" />
```

to:

```typescript
          <div className="flex-1 flex items-center lg:justify-start">
            <GlobalSearchBar />
          </div>
```

- [ ] **Step 5: Run frontend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/components/GlobalSearchBar.test.tsx
```
Expected: 2 passed

- [ ] **Step 6: Run full frontend suite**

```bash
npx vitest run 2>&1 | tail -5
```
Expected: `Tests  158 passed (158)`

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/services/searchService.ts \
        LMS-Frontend/src/components/GlobalSearchBar.tsx \
        LMS-Frontend/src/__tests__/components/GlobalSearchBar.test.tsx \
        LMS-Frontend/src/components/Layout.tsx
git commit -m "feat: add GlobalSearchBar component with Ctrl+K shortcut

Command-palette style search in Layout navbar. Debounced API calls,
categorized results (courses, users, credentials, quizzes). Role-aware
navigation. 2 new FE tests (SRCH-FE-1, SRCH-FE-2). 158/158 FE pass.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Verification + Merge + Closeout

**Files:**
- Modify: nothing new — verification only
- Create: `docs/superpowers/plans/2026-08-11-phase26-c1-closeout.md`

**Interfaces:**
- Consumes: all files from Tasks 1-2
- Produces: merged `main` branch with tag `phase26-c1-complete-2026-08-11`

- [ ] **Step 1: TypeScript checks**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx tsc --noEmit
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 2: Full test suites**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run 2>&1 | tail -5
```
Expected: `Tests  656 passed (656)`

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run 2>&1 | tail -5
```
Expected: `Tests  158 passed (158)`

- [ ] **Step 3: Vite production build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vite build 2>&1 | tail -5
```
Expected: `✓ built in` with no errors

- [ ] **Step 4: Request code review**

Dispatch code reviewer subagent with `git diff main..HEAD`.

- [ ] **Step 5: Fix any review issues**

Apply fixes, re-run verification, commit.

- [ ] **Step 6: Merge to main + tag**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge feat/phase26-c1-global-search --no-ff -m "merge: Phase 26 C1 — Global Search

GET /search endpoint + GlobalSearchBar (Ctrl+K). RBAC-aware search across
courses, users, credentials, quizzes. 656/656 BE + 158/158 FE = 814 total tests.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git tag phase26-c1-complete-2026-08-11
```

- [ ] **Step 7: Write closeout document**

Create `docs/superpowers/plans/2026-08-11-phase26-c1-closeout.md` with summary, files changed, test counts, rollback instructions.

- [ ] **Step 8: Update memory**

Update `MEMORY.md` test counts: `652 → 656 BE`, `156 → 158 FE`, `808 → 814 total`.

- [ ] **Step 9: Final commit**

```bash
git add docs/superpowers/plans/2026-08-11-phase26-c1-closeout.md
git commit -m "docs: Phase 26 C1 global search closeout

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
