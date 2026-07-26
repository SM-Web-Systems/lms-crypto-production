# Student Progress Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make course progress concrete and visible — progress bars with "N of M lessons" in StudentDashboard course cards, a live top bar in StudentCourse, and (NICE-TO-HAVE) last quiz score per course.

**Architecture:** The LMS backend already computes and returns `lessonsCompleted`, `totalLessons`, `lessonPercentage` via `GET /students/me/progress`. No backend API changes are needed for NM-B1/B2/B3. The frontend work re-uses the existing `progressMap` that StudentDashboard already fetches. StudentCourse adds a separate `GET /courses/:id/progress` call that refreshes on lesson completion.

**Tech Stack:** TypeScript, React, Vite (LMS Frontend), Express + SQLite (LMS Backend), better-sqlite3, vitest + supertest (backend tests), Tailwind CSS.

## Global Constraints

- LMS test runner: `cd LMS-Server && npx vitest run --sequence.shuffle=false` — must stay green (currently 280 passing)
- LMS frontend deploy: ALWAYS use `docker compose build web && docker compose up -d --no-deps web` — NEVER local `npm run build` + copy (loses `VITE_API_BASE_URL`)
- LMS frontend working dir: `/home/webadmin/web-stack/html/LMS-AmmaWallet`
- Docker Compose file: `dev-next-lms-version-docker-compose.yml` (check actual filename before running)
- Backend API shape for `/students/me/progress` must remain unchanged (additive only)
- NM-B4 (last quiz score in dashboard) is NICE-TO-HAVE — implement only after NM-B1/B2/B3 are verified

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `LMS-Server/src/__tests__/student-progress.test.ts` | Modify | Add SMP-6 through SMP-9 regression tests |
| `LMS-Frontend/src/pages/StudentDashboard.tsx` | Modify | Progress bars in course cards (NM-B2); quiz score section (NM-B4) |
| `LMS-Frontend/src/pages/StudentCourse.tsx` | Modify | Live top progress bar updated on lesson completion (NM-B3) |
| `LMS-Frontend/src/services/courseService.ts` | Check only | Verify `getCourseProgress()` or equivalent exists for per-course fetch |

---

### Task 1: API regression tests for progress shape (NM-B1)

**Files:**
- Modify: `LMS-Server/src/__tests__/student-progress.test.ts`

**Context:** The API already exists and returns the right fields. This task adds regression tests so future changes can't quietly remove them.

- [ ] **Step 1: Open existing test file and add tests after existing SMP-5**

Open `LMS-Server/src/__tests__/student-progress.test.ts`. Add the following tests to the existing `describe` block (after the last existing test):

```typescript
it('SMP-6: lessonPercentage is 0 when no lessons completed', async () => {
  // seedBase() creates a user enrolled in a course; assume the course has lesson items
  // We need to ensure no lesson_completions exist for the test user
  const { db } = await import('../config/database.js');
  const userId = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('student') as { id: string };
  // Clear any existing completions for this user
  db.prepare('DELETE FROM lesson_completions WHERE user_id = ?').run(userId.id);

  const token = await getStudentToken(); // helper already in file
  const res = await request(app)
    .get('/api/v1/students/me/progress')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const course = res.body.data.courses[0];
  if (!course) return; // skip if not enrolled in any course
  expect(course.lessonsCompleted).toBe(0);
  expect(typeof course.lessonPercentage).toBe('number');
  expect(course.lessonPercentage).toBeGreaterThanOrEqual(0);
  expect(course.lessonPercentage).toBeLessThanOrEqual(100);
});

it('SMP-7: lessonPercentage is 100 when all lesson items completed', async () => {
  const { db } = await import('../config/database.js');
  const userId = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('student') as { id: string };
  const enrolled = db.prepare(
    `SELECT c.id as courseId, c.sections FROM courses c
     JOIN user_course_codes ucc ON ucc.course_code = c.course_code
     WHERE ucc.user_id = ? LIMIT 1`
  ).get(userId.id) as { courseId: string; sections: string } | undefined;

  if (!enrolled) return; // not enrolled — skip

  const sections = JSON.parse(enrolled.sections || '[]');
  const items = sections.flatMap((s: any) => s.items ?? []);
  if (items.length === 0) return; // no items — skip

  // Mark all items complete
  for (const item of items) {
    db.prepare(
      `INSERT OR IGNORE INTO lesson_completions (id, user_id, course_id, item_id, completed_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(`lc-smp7-${item.id}`, userId.id, enrolled.courseId, item.id);
  }

  const token = await getStudentToken();
  const res = await request(app)
    .get('/api/v1/students/me/progress')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const course = res.body.data.courses.find((c: any) => c.courseId === enrolled.courseId);
  expect(course?.lessonPercentage).toBe(100);
  expect(course?.lessonsCompleted).toBe(items.length);
  expect(course?.totalLessons).toBe(items.length);
});

it('SMP-8: response includes all required fields per course', async () => {
  const token = await getStudentToken();
  const res = await request(app)
    .get('/api/v1/students/me/progress')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  expect(res.body.success).toBe(true);
  expect(Array.isArray(res.body.data.courses)).toBe(true);
  if (res.body.data.courses.length > 0) {
    const c = res.body.data.courses[0];
    expect(c).toHaveProperty('courseId');
    expect(c).toHaveProperty('courseName');
    expect(c).toHaveProperty('lessonsCompleted');
    expect(c).toHaveProperty('totalLessons');
    expect(c).toHaveProperty('lessonPercentage');
    expect(c).toHaveProperty('certificateStatus');
  }
});

it('SMP-9: GET /courses/:id/progress returns same lesson fields', async () => {
  const { db } = await import('../config/database.js');
  const course = db.prepare('SELECT id FROM courses LIMIT 1').get() as { id: string } | undefined;
  if (!course) return;

  const token = await getStudentToken();
  const res = await request(app)
    .get(`/api/v1/courses/${course.id}/progress`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  expect(res.body.success).toBe(true);
  expect(res.body.data).toHaveProperty('totalLessonItems');
  expect(res.body.data).toHaveProperty('completedLessonItems');
  expect(res.body.data).toHaveProperty('lessonPercentage');
});
```

**Note:** If `getStudentToken()` is not a named helper in the existing test file, look for the pattern used to generate a JWT for a student user and replicate it. Typically it's something like:
```typescript
async function getStudentToken(): Promise<string> {
  const student = db.prepare("SELECT id FROM users WHERE role = 'student' LIMIT 1").get() as { id: string };
  return jwt.sign({ userId: student.id, role: 'student' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}
```

- [ ] **Step 2: Run tests to confirm all pass**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run --sequence.shuffle=false src/__tests__/student-progress.test.ts 2>&1 | tail -20
```

Expected: SMP-1 through SMP-9 all pass.

- [ ] **Step 3: Run full suite to confirm no regressions**

```bash
npx vitest run --sequence.shuffle=false 2>&1 | tail -5
```

Expected: `284 passed` (280 + 4 new).

- [ ] **Step 4: Commit**

```bash
git add LMS-Server/src/__tests__/student-progress.test.ts
git commit -m "test(NM-B1): add SMP-6 through SMP-9 regression tests for progress API shape"
```

---

### Task 2: Progress bar in StudentDashboard course cards (NM-B2)

**Files:**
- Modify: `LMS-Frontend/src/pages/StudentDashboard.tsx`

**Context:** StudentDashboard loads `progressMap: Record<string, CourseProgress>` keyed by `courseId`. The cert section already uses `prog = progressMap[course.id]` and renders a small progress bar. The enrolled course CARDS section (separate from the cert section) does not yet show progress. The goal is to add a compact progress bar + "N of M lessons" to each course card.

**Finding the course card section:** Search for "Enrolled courses" or the block that renders `courses.map(course => ...)` — this is the main course listing near the top of the dashboard body. It renders as clickable cards that navigate to `/student/courses/:id`.

- [ ] **Step 1: Locate the course card render block in StudentDashboard.tsx**

Run: `grep -n "courses.map\|course cards\|enrolled" /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend/src/pages/StudentDashboard.tsx | head -20`

Identify the JSX section that maps over `courses` to render course cards. Note the line numbers.

- [ ] **Step 2: Ensure progressMap is populated before the course cards render**

Check whether `progressMap` is being populated from the existing `/students/me/progress` fetch or a separate per-course call. In StudentDashboard, find the `useEffect` that populates `progressMap`. If it already uses `/students/me/progress`, `progressMap[course.id]` will be available.

If `progressMap` is only populated via cert-section logic (per-course calls), confirm it covers all enrolled courses.

- [ ] **Step 3: Add progress bar markup to each course card**

Inside the course card map, after the existing card content (course title, etc.), add:

```tsx
{/* Progress bar — NM-B2 */}
{(() => {
  const prog = progressMap[course.id];
  if (!prog) return null;
  const pct = prog.lessonPercentage ?? 0;
  const completed = prog.completedLessonItems ?? 0;
  const total = prog.totalLessonItems ?? 0;
  if (total === 0) return null; // course has no lesson items — skip
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{completed} of {total} lessons</span>
        <span className="tabular-nums font-medium text-neutral-700">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
        <div
          className="h-1.5 rounded-full bg-gradient-to-r from-accent-teal to-primary-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% of lessons complete`}
        />
      </div>
    </div>
  );
})()}
```

- [ ] **Step 4: Build and deploy frontend**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build web 2>&1 | tail -5
docker compose up -d --no-deps web
docker ps | grep lms-web
```

Expected: `lms-web` container shows `Up`.

- [ ] **Step 5: Smoke test in browser**

1. Log into lms.smwebsystems.com as a student
2. Verify course cards show "X of Y lessons" + progress bar
3. Verify a course with 0 lesson items does not show the progress bar
4. Verify the bar is filled proportionally (50% = half width)

- [ ] **Step 6: Commit frontend change**

```bash
git add LMS-Frontend/src/pages/StudentDashboard.tsx
git commit -m "feat(NM-B2): add progress bar and lesson counter to course cards in StudentDashboard"
```

---

### Task 3: Live progress bar in StudentCourse (NM-B3)

**Files:**
- Modify: `LMS-Frontend/src/pages/StudentCourse.tsx`

**Context:** StudentCourse renders the course lessons and handles lesson check-off via `POST /courses/:courseId/lessons/completions`. After a lesson is marked complete, the local state updates but there's currently no visible progress bar at the top of the page. This task adds one that refreshes on completion.

**API to call:** `GET /api/v1/courses/:courseId/progress` — returns `{ success, data: { totalLessonItems, completedLessonItems, lessonPercentage, ... } }`. This is already implemented in `LMS-Server/src/routes/progress.ts`.

- [ ] **Step 1: Read the existing lesson check-off handler in StudentCourse.tsx**

```bash
grep -n "completions\|checkOff\|handleComplete\|lesson.*complete\|POST.*lesson" /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend/src/pages/StudentCourse.tsx | head -20
```

Identify: (a) the function that fires after a lesson is marked complete, (b) the existing state variables, (c) where the component fetches course data.

- [ ] **Step 2: Add progress state and fetch function**

Near the top of the `StudentCourse` component, add:

```typescript
const [lessonProgress, setLessonProgress] = useState<{
  completedLessonItems: number;
  totalLessonItems: number;
  lessonPercentage: number;
} | null>(null);

const fetchProgress = useCallback(async () => {
  if (!courseId) return;
  try {
    const res = await fetch(`/api/v1/courses/${courseId}/progress`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('lms_token')}` },
    });
    if (!res.ok) return;
    const body = await res.json();
    if (body.success) setLessonProgress(body.data);
  } catch {
    // non-fatal
  }
}, [courseId]);
```

**Note:** Replace `localStorage.getItem('lms_token')` with however the JWT is accessed in this component — look for existing `fetch` calls with `Authorization` headers to find the exact pattern.

- [ ] **Step 3: Fetch progress on mount and after each lesson completion**

Add to `useEffect` (or add a new one):

```typescript
useEffect(() => {
  fetchProgress();
}, [fetchProgress]);
```

In the lesson completion handler (wherever `POST /courses/:courseId/lessons/completions` is called), add `fetchProgress()` after a successful response:

```typescript
// After successful lesson completion POST:
await fetchProgress();
```

- [ ] **Step 4: Render the sticky progress bar at the top of the course page**

Find the outermost container or the course title block. Add the progress bar just below the course title / header area:

```tsx
{/* Live lesson progress bar — NM-B3 */}
{lessonProgress && lessonProgress.totalLessonItems > 0 && (
  <div className="mb-4 space-y-1">
    <div className="flex items-center justify-between text-xs text-neutral-600">
      <span className="font-medium">
        {lessonProgress.completedLessonItems} of {lessonProgress.totalLessonItems} lessons complete
      </span>
      <span className="tabular-nums text-neutral-500">{lessonProgress.lessonPercentage}%</span>
    </div>
    <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
      <div
        className="h-2 rounded-full bg-gradient-to-r from-accent-teal to-primary-600 transition-all duration-500"
        style={{ width: `${lessonProgress.lessonPercentage}%` }}
        role="progressbar"
        aria-valuenow={lessonProgress.lessonPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${lessonProgress.lessonPercentage}% of lessons complete`}
      />
    </div>
  </div>
)}
```

- [ ] **Step 5: Build and deploy**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build web 2>&1 | tail -5
docker compose up -d --no-deps web
```

- [ ] **Step 6: Smoke test**

1. Open a course with lesson items as a student
2. Verify progress bar appears at top showing current completion %
3. Check off a lesson — verify progress bar advances without page refresh
4. Verify a course with 0 lesson items shows no progress bar

- [ ] **Step 7: Commit**

```bash
git add LMS-Frontend/src/pages/StudentCourse.tsx
git commit -m "feat(NM-B3): add live lesson progress bar to StudentCourse, refreshes on completion"
```

---

### Task 4 (NICE-TO-HAVE): Last quiz score in StudentDashboard (NM-B4)

**Files:**
- Modify: `LMS-Frontend/src/pages/StudentDashboard.tsx`

**Context:** `quizCompletions` is already loaded in StudentDashboard (`quizService.getCompletionsForUser(uid)`). Each `QuizCompletion` has: `quizId`, `score`, `total`, `passed`, `completedAt`. Quizzes belong to courses. This task groups completions by course and shows the most recent score per course under the course section.

**Note:** This requires knowing which quiz belongs to which course. Either `QuizCompletion` includes `courseId`, or we need to cross-reference the quiz against course data. Check `quizService.getCompletionsForUser()` response shape before implementing.

- [ ] **Step 1: Check QuizCompletion shape**

```bash
grep -n "QuizCompletion\|getCompletionsForUser" /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend/src/types/quiz.ts /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend/src/services/quizService.ts 2>/dev/null | head -20
```

If `QuizCompletion` has `courseId` or `quizTitle`: proceed with grouping. If not, this task may require a backend change to include `courseId` in the completions response — defer to next sprint if backend change needed.

- [ ] **Step 2: Add quiz score display under each course in dashboard**

Only proceed if `QuizCompletion` includes enough data to group by course. Under each course's progress bar, add:

```tsx
{/* Last quiz score — NM-B4 */}
{(() => {
  const courseQuizzes = quizCompletions?.filter(q => q.courseId === course.id) ?? [];
  const lastQuiz = courseQuizzes.sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  )[0];
  if (!lastQuiz) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5 text-xs text-neutral-500">
      <span>Last quiz: </span>
      <span className={`font-medium ${lastQuiz.passed ? 'text-emerald-700' : 'text-red-600'}`}>
        {lastQuiz.score}/{lastQuiz.total}
        {lastQuiz.passed ? ' ✓' : ' ✗'}
      </span>
      <span className="text-neutral-400">
        {new Date(lastQuiz.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
      </span>
    </div>
  );
})()}
```

- [ ] **Step 3: Build, deploy, and verify**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build web && docker compose up -d --no-deps web
```

Smoke test: student with a completed quiz should see "Last quiz: X/Y ✓" under that course.

- [ ] **Step 4: Commit**

```bash
git add LMS-Frontend/src/pages/StudentDashboard.tsx
git commit -m "feat(NM-B4): show last quiz score and attempt date in StudentDashboard course section"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** NM-B1 (Task 1 tests), NM-B2 (Task 2), NM-B3 (Task 3), NM-B4 (Task 4 NICE-TO-HAVE) — all covered
- [x] **No placeholders:** all JSX and test code is complete
- [x] **Frontend deploy warning included:** every task that touches frontend includes `docker compose build web` command
- [x] **progressMap re-use:** Task 2 uses existing `progressMap` state — no new API call
- [x] **fetchProgress pattern:** Task 3 shows exact fetch call with auth header pattern note
- [x] **Test count:** starts at 280, ends at 284 (+ 4 SMP regression tests)
