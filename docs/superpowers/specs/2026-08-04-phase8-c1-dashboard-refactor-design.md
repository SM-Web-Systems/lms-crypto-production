# Phase 8 C1: StudentDashboard Refactor — Developer Spec

**Date:** 2026-08-04
**Status:** SPEC READY
**Type:** Pure structural refactor — zero behavioural changes
**Baseline:** 448/448 tests, tsc clean, `phase7-c3-complete-2026-08-04`

---

## Problem Statement

`StudentDashboard.tsx` is 908 lines with 12 `useState` hooks, 6 `useEffect` blocks, and 9 JSX sections. All state, data fetching, computed values, and rendering live in a single component. This makes the file:

1. **Hard to reason about** — changing the certificate eligibility section requires scrolling past NFT badges, stats, and quickActions arrays
2. **Hard to review** — any diff touches a 900-line file, increasing merge-conflict risk
3. **Hard to test** — no unit/component tests exist, and the monolith makes targeted testing impractical
4. **Slow to iterate** — adding a new dashboard section means growing an already oversized file

## Goals

1. Break `StudentDashboard.tsx` from ~908 lines to ~120 lines (orchestrator only)
2. Extract 6 focused sub-components, each owning its own state and data fetching
3. Preserve **identical** runtime behaviour — same HTML, same CSS, same API calls, same user interactions
4. Keep all existing imports/exports stable (no changes to `App.tsx` routing)
5. Make future dashboard work (new sections, A/B tests) additive rather than invasive

## Non-Goals

- No new features, UI changes, or API calls
- No new backend routes or database changes
- No frontend test setup (deferred to Phase 8 C3)
- No changes to other pages (StudentProgress, StudentCourse, etc.)
- No performance optimisation (React.memo, lazy loading, etc.)
- No shared state management library (Context, Zustand, etc.)

---

## Current Architecture

### State Hooks (12)

| # | Hook | Type | Used by section |
|---|------|------|-----------------|
| 1 | `quizCompletions` | `QuizCompletion[] \| null` | Stats, Checklist |
| 2 | `nftBadges` | `NFTResponse \| null` | NFT Badges |
| 3 | `lmsCredentials` | `MyCredential[] \| null` | LMS Certificates |
| 4 | `lmsCredentialsError` | `boolean` | LMS Certificates |
| 5 | `courses` | `Course[]` | Cert Eligibility, Checklist |
| 6 | `coursesLoading` | `boolean` | Cert Eligibility |
| 7 | `progressMap` | `Record<string, CourseProgress>` | Cert Eligibility, Checklist |
| 8 | `certState` | `Record<string, ...>` | Cert Eligibility |
| 9 | `certErrors` | `Record<string, string>` | Cert Eligibility |
| 10 | `appStatusMap` | `Record<string, NftApplication \| null>` | Cert Eligibility, Checklist |
| 11 | `checklistDismissed` | `boolean` | Checklist |
| 12 | (from DataContext) `submissions` + loading/error | `Submission[]` | Stats, Recent Submissions |

### JSX Sections (9)

1. **Wallet status** — `<StudentWalletStatusCard>` (already extracted)
2. **Onboarding checklist** — collapsible getting-started steps
3. **Hero** — greeting, daily nudge, CTA buttons
4. **Quick actions** — 6-card navigation grid
5. **NFT badges** — grid of `<NftCard>` from wallet
6. **LMS certificates** — issued credentials from `/credentials/mine`
7. **Certificate eligibility** — per-course progress + apply button (~200 lines)
8. **Stats** — 4-stat card grid
9. **Announcements** — `<AnnouncementsPanel>` (already extracted)
10. **Recent submissions** — latest 5 submissions list

### Data Flow

```mermaid
graph TD
    SD[StudentDashboard] --> |useAuth| user
    SD --> |useData| submissions
    SD --> |useEffect 1| fetchSubmissions
    SD --> |useEffect 2| getUserNfts
    SD --> |useEffect 3| quizService.getCompletionsForUser
    SD --> |useEffect 4| courseCompletionService.getMyCredentials
    SD --> |useEffect 5| courseService.fetchCourses + getCourseProgress + getCourseApplications
    SD --> |useEffect 6| localStorage checklist
```

### Cross-Section Dependencies

The checklist section is the only cross-cutting concern — it reads from:
- `user.walletAddress` (auth)
- `courses.length` (from cert eligibility fetch)
- `progressMap` (from cert eligibility fetch)
- `quizPassed` (from quiz completions fetch)
- `appStatusMap` (from cert eligibility fetch)

This means the checklist cannot independently fetch its own data — it must receive props from the orchestrator or from the cert eligibility section's data.

---

## Target Architecture

### Component Hierarchy

```
StudentDashboard.tsx (~120 lines — orchestrator)
├── StudentWalletStatusCard (existing, unchanged)
├── OnboardingChecklist (new)
├── DashboardHero (new)
├── QuickActionsGrid (new)
├── NftBadgesSection (new)
├── LmsCertificatesSection (new)
├── CertEligibilitySection (new)
├── EngagementStats (new)
├── AnnouncementsPanel (existing, unchanged)
└── RecentSubmissionsCard (new)
```

### File Layout

All new components go in `LMS-Frontend/src/components/dashboard/`:

```
components/dashboard/
├── OnboardingChecklist.tsx    (~80 lines)
├── DashboardHero.tsx          (~70 lines)
├── QuickActionsGrid.tsx       (~80 lines)
├── NftBadgesSection.tsx       (~40 lines)
├── LmsCertificatesSection.tsx (~70 lines)
├── CertEligibilitySection.tsx (~220 lines)
├── EngagementStats.tsx        (~70 lines)
└── RecentSubmissionsCard.tsx   (~90 lines)
```

**Why `components/dashboard/`?** These are page-specific sub-components, not reusable UI primitives. Nesting under `dashboard/` keeps the flat `components/` directory clean and signals that these are private to StudentDashboard.

---

## Component Specifications

### C1. `DashboardHero.tsx`

**Props:**
```typescript
interface DashboardHeroProps {
  userName: string;        // user.name
  engagementHint: { text: string; icon: React.ComponentType<{ className?: string }> };
}
```

**Owns:** `greetingForHour()`, `pickDailyLine()`, `DAY_LINES` constant (moved from top of StudentDashboard)

**State:** None

**JSX:** The hero `<section>` (lines 442–484)

**Notes:** `engagementHint` is passed as a prop because it depends on `submissions` and `quizPassed` which are owned by the orchestrator. The greeting and daily line are computed internally.

### C2. `QuickActionsGrid.tsx`

**Props:** None (self-contained)

**Owns:** `quickActions` array constant, navigation via `useNavigate()`

**State:** None

**JSX:** The quick actions `<section>` (lines 487–519)

### C3. `NftBadgesSection.tsx`

**Props:**
```typescript
interface NftBadgesSectionProps {
  walletAddress: string | null | undefined;
}
```

**Owns:** NFT data fetching (`getUserNfts`), `nftBadges` state

**State:** `nftBadges: NFTResponse | null`

**JSX:** The NFT badges `<section>` (lines 522–533)

### C4. `LmsCertificatesSection.tsx`

**Props:** None (self-contained — reads `user` from `useAuth()`)

**Owns:** LMS credentials fetch (`getMyCredentials`), error state

**State:** `lmsCredentials`, `lmsCredentialsError`

**JSX:** The LMS certificates `<section>` (lines 536–595)

**Notes:** Only renders when credentials exist or there's an error. The conditional rendering stays inside the component (returns `null` if no credentials and no error).

### C5. `CertEligibilitySection.tsx`

**Props:**
```typescript
interface CertEligibilitySectionProps {
  onDataReady?: (data: {
    courses: Course[];
    progressMap: Record<string, CourseProgress>;
    appStatusMap: Record<string, NftApplication | null>;
  }) => void;
}
```

**Owns:** Course + progress + application fetching (useEffect 5), `handleApplyCertificate`, all cert-related state (`courses`, `coursesLoading`, `progressMap`, `certState`, `certErrors`, `appStatusMap`), `CERT_STATE_MSGS` constant

**State:** `courses`, `coursesLoading`, `progressMap`, `certState`, `certErrors`, `appStatusMap`

**JSX:** The cert eligibility `<section>` + skeleton (lines 598–800)

**Notes:** The `onDataReady` callback is called when data loads, allowing the orchestrator to feed the checklist. This is a one-way data flow — CertEligibilitySection is the owner, and the orchestrator just relays the values to OnboardingChecklist. Alternatively, the orchestrator could keep the course-fetching effect and pass data down to both CertEligibilitySection and OnboardingChecklist as props — see Decision D1 below.

### C6. `OnboardingChecklist.tsx`

**Props:**
```typescript
interface OnboardingChecklistProps {
  walletConnected: boolean;
  enrolled: boolean;
  hasCompletedLesson: boolean;
  quizPassed: boolean;
  hasApplied: boolean;
}
```

**Owns:** `checklistDismissed` state, `handleDismissChecklist` handler, localStorage integration

**State:** `checklistDismissed: boolean`

**JSX:** The checklist `<section>` (lines 389–439)

**Notes:** Returns `null` when dismissed. The boolean props are computed by the orchestrator from data owned by other sections (this avoids duplicating API calls).

### C7. `EngagementStats.tsx`

**Props:**
```typescript
interface EngagementStatsProps {
  submissions: Submission[];
  quizCompletions: QuizCompletion[] | null;
}
```

**Owns:** `stats` array definition, count computations (`pendingCount`, `approvedCount`, `rejectedCount`, `quizTaken`, `quizPassed`)

**State:** None

**JSX:** The stats `<section>` (lines 803–834)

### C8. `RecentSubmissionsCard.tsx`

**Props:**
```typescript
interface RecentSubmissionsCardProps {
  submissions: Submission[];
}
```

**Owns:** None

**State:** None

**JSX:** The recent submissions `<Card>` (lines 839–903)

---

## Design Decision: D1 — Course Data Ownership

**Problem:** The course/progress/appStatus data is needed by both `CertEligibilitySection` and `OnboardingChecklist`. Two options:

**Option A — Callback pattern:** `CertEligibilitySection` owns the fetch and calls `onDataReady` when loaded. Orchestrator relays to `OnboardingChecklist` via state.

**Option B — Orchestrator owns the fetch:** Keep the course-fetching useEffect in `StudentDashboard`, pass data down as props to both components.

**Decision: Option B** — The orchestrator keeps the course data fetch (useEffect 5) because:
1. The checklist needs the data to render correctly on first paint
2. Lifting the fetch to the orchestrator is simpler than a callback relay
3. `CertEligibilitySection` receives its data as props, making it purely presentational + interactive (apply button handler)
4. This is consistent with how `submissions` already works (owned by DataContext, passed to multiple sections)

**Revised CertEligibilitySection props:**
```typescript
interface CertEligibilitySectionProps {
  courses: Course[];
  coursesLoading: boolean;
  progressMap: Record<string, CourseProgress>;
  appStatusMap: Record<string, NftApplication | null>;
  onAppStatusChange: (courseId: string, app: NftApplication) => void;
}
```

The `onAppStatusChange` callback lets the section notify the orchestrator when a cert application is submitted (so the checklist updates). The section owns `certState` and `certErrors` internally since those are UI-only state for the apply button.

---

## Orchestrator Shape (StudentDashboard.tsx after refactor)

```typescript
const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const { submissions, submissionsLoading, submissionsError, fetchSubmissions } = useData();

  // Quiz completions — needed by checklist + stats
  const [quizCompletions, setQuizCompletions] = useState<QuizCompletion[] | null>(null);

  // Course data — needed by cert eligibility + checklist
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<string, CourseProgress>>({});
  const [appStatusMap, setAppStatusMap] = useState<Record<string, NftApplication | null>>({});

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);
  useEffect(() => { /* quiz completions fetch */ }, [user?.id]);
  useEffect(() => { /* courses + progress + apps fetch */ }, [user]);

  const quizPassed = useMemo(() => /* ... */, [quizCompletions]);
  const engagementHint = useMemo(() => /* ... */, [submissions, quizPassed]);

  const handleAppStatusChange = (courseId: string, app: NftApplication) => {
    setAppStatusMap((m) => ({ ...m, [courseId]: app }));
  };

  if (submissionsLoading) return <DashboardPageSkeleton variant="student" />;
  if (submissionsError) return /* error UI */;

  return (
    <div className="pb-10 space-y-8">
      {user && <StudentWalletStatusCard user={user} />}
      <OnboardingChecklist
        walletConnected={Boolean(user?.walletAddress)}
        enrolled={courses.length > 0}
        hasCompletedLesson={Object.values(progressMap).some(p => p.completedLessonItems > 0)}
        quizPassed={quizPassed > 0}
        hasApplied={Object.values(appStatusMap).some(app => app !== null)}
      />
      <DashboardHero userName={user?.name ?? 'there'} engagementHint={engagementHint} />
      <QuickActionsGrid />
      <NftBadgesSection walletAddress={user?.walletAddress} />
      <LmsCertificatesSection />
      <CertEligibilitySection
        courses={courses}
        coursesLoading={coursesLoading}
        progressMap={progressMap}
        appStatusMap={appStatusMap}
        onAppStatusChange={handleAppStatusChange}
      />
      <EngagementStats submissions={submissions} quizCompletions={quizCompletions} />
      <AnnouncementsPanel isAdmin={false} />
      <RecentSubmissionsCard submissions={submissions} />
    </div>
  );
};
```

**Remaining in orchestrator:** ~120 lines (imports, 3 useEffects, 2 useMemos, error/loading guards, JSX composition).

---

## Migration Strategy

**Approach: Extract-and-inline, one section at a time.**

Each extraction follows the same pattern:
1. Create new file in `components/dashboard/`
2. Copy JSX + related state/handlers/constants
3. Define props interface
4. Replace the inline JSX in `StudentDashboard.tsx` with `<ComponentName ... />`
5. Remove unused imports from `StudentDashboard.tsx`
6. Verify: `tsc` clean, Docker build, visual equivalence

**Order of extraction (safest first):**

| Step | Component | Risk | Reason |
|------|-----------|------|--------|
| 1 | `QuickActionsGrid` | Lowest | Zero state, zero props, self-contained |
| 2 | `DashboardHero` | Low | No state, 2 props, moves constants |
| 3 | `RecentSubmissionsCard` | Low | 1 prop, no state, no side effects |
| 4 | `EngagementStats` | Low | 2 props, pure computation |
| 5 | `NftBadgesSection` | Low | Moves 1 useEffect + 1 useState |
| 6 | `LmsCertificatesSection` | Low | Moves 1 useEffect + 2 useState |
| 7 | `OnboardingChecklist` | Medium | Props depend on cross-section data |
| 8 | `CertEligibilitySection` | Medium | Largest section, owns apply handler, needs callback |

---

## Touched Files

| File | Change |
|------|--------|
| `src/pages/StudentDashboard.tsx` | Shrink from ~908 → ~120 lines |
| `src/components/dashboard/QuickActionsGrid.tsx` | **New** (~80 lines) |
| `src/components/dashboard/DashboardHero.tsx` | **New** (~70 lines) |
| `src/components/dashboard/RecentSubmissionsCard.tsx` | **New** (~90 lines) |
| `src/components/dashboard/EngagementStats.tsx` | **New** (~70 lines) |
| `src/components/dashboard/NftBadgesSection.tsx` | **New** (~40 lines) |
| `src/components/dashboard/LmsCertificatesSection.tsx` | **New** (~70 lines) |
| `src/components/dashboard/OnboardingChecklist.tsx` | **New** (~80 lines) |
| `src/components/dashboard/CertEligibilitySection.tsx` | **New** (~220 lines) |

**Total:** 1 modified + 8 new = 9 files
**Net lines:** ~0 (moved, not added)

---

## Acceptance Criteria

1. `StudentDashboard.tsx` is ≤150 lines
2. Each extracted component is ≤250 lines
3. `npx tsc --noEmit` passes for frontend
4. `docker compose build web` succeeds
5. Site returns HTTP 200
6. API health returns `{"status":"ok","db":"ok"}`
7. Backend tests: 448/448
8. Visual QA: dashboard renders identically (same sections, same order, same styling)
9. No new console errors or warnings
10. Certificate apply flow works (eligible → pending transition)
11. Onboarding checklist dismiss persists across page reload
12. NFT badges load for wallet-connected users

---

## Edge Cases & Fallbacks

| Scenario | Current Behaviour | After Refactor |
|----------|------------------|----------------|
| No user (logged out) | Redirect via auth guard | Unchanged |
| Submissions loading | `<DashboardPageSkeleton>` | Unchanged (orchestrator) |
| Submissions error | Error card with retry | Unchanged (orchestrator) |
| No wallet connected | NFT section shows "No NFT badges yet" | Unchanged (NftBadgesSection handles null) |
| No courses enrolled | Cert eligibility hidden | Unchanged (CertEligibilitySection returns null) |
| Credentials fetch error | Warning banner | Unchanged (LmsCertificatesSection handles internally) |
| Checklist dismissed | Hidden via localStorage | Unchanged (OnboardingChecklist handles internally) |
| Cert apply 409 conflict | Re-fetches existing app | Unchanged (CertEligibilitySection handles internally) |

---

## Test Strategy

**Backend tests:** No changes — 448/448 must pass unchanged.

**Frontend verification (manual, no test framework):**
1. tsc clean (frontend + backend)
2. Docker build + deploy
3. Visual comparison: same sections, same order, same CSS classes
4. Interactive checks: checklist dismiss, cert apply, quick action navigation
5. Console: no new errors/warnings

**Why no component tests?** Frontend test setup (vitest + RTL) is deferred to Phase 8 C3. This refactor actually makes C3 easier — each sub-component can be tested in isolation once the framework is in place.

---

## Rollback Plan

- Revert the single merge commit from feature branch
- `docker compose build web && docker compose up -d --no-deps web`
- No backend or data impact

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Prop drilling breaks data flow | Low | Medium | Decision D1 keeps data ownership clear |
| Import path errors | Low | Low | tsc catches at compile time |
| CSS class loss during copy | Low | Medium | Line-by-line copy, visual QA |
| Circular dependency | Very low | Medium | dashboard/ components only import from services + types, never from pages |
| Performance regression (extra renders) | Very low | Low | No React.memo needed — same render tree, just split across files |

---

## Phase 8 C1 Spec Status: SPEC READY

**Next step:** Write implementation plan (writing-plans skill), then execute.
