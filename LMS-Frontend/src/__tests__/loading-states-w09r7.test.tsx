/**
 * W09-R7 — Auth-refresh overlap with certificate application mutation
 *
 * Investigation: can a same-user auth-refresh-triggered courses-effect re-run
 * produce a user-visible defect when a certificate application mutation is
 * in-flight or recently committed?
 *
 * Background (see docs/release/W09-R7-spec.md):
 * AuthProvider.refresh() calls setUser(response.data.data) on every /auth/me
 * success. The returned data is always a new JSON-deserialised object — new
 * object reference even when all fields are identical. StudentDashboard's
 * courses effect depends on [user, coursesRetryCount], so it re-runs on every
 * auth refresh. The effect does a full replace of appStatusMap (setAppStatusMap(newApps)).
 * If the server returns empty (stale read) while a mutation or 409 recovery
 * has already committed a non-null status, the full replace wipes the committed
 * result — causing hasApplied in OnboardingChecklist to show false even though
 * the application succeeded.
 *
 * Auth refresh is synthesised by supplying a structurally-identical but distinct
 * User object to useAuth and rerendering. This accurately models AuthProvider
 * .refresh()'s setUser(response.data.data) because:
 *   - JSON deserialisation always produces a new object
 *   - React Object.is comparison fails for two distinct objects
 *   - The courses effect dependency [user, ...] sees a changed value and re-runs
 * Same-user refresh and account replacement are distinguished in T4.
 *
 * Test IDs follow the W09-R7 spec:
 * T1a: mutation commits before stale courses refetch → hasApplied=false (DEFECT)
 * T1b: courses refetch resolves before mutation → no regression
 * T2:  already-pending + auth refresh stale empty → eligible reinstated (DEFECT)
 * T3:  409 recovery commit + auth-refresh full replace → wipes recovery (DEFECT)
 * T4:  account replacement (different userId) → old courses refetch cancelled
 * T5:  courses fetch error during auth refresh → hasApplied=null, not false
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ──── Module mocks — must precede all imports ─────────────────────────────────

vi.mock('../context/useAuth', () => ({ useAuth: vi.fn() }));

vi.mock('../context/DataContext', () => ({
  useData: vi.fn(),
}));

vi.mock('../services/quizService', () => ({
  quizService: { getCompletionsForUser: vi.fn() },
}));

vi.mock('../services/courseService', () => ({
  courseService: { fetchCourses: vi.fn() },
}));

vi.mock('../services/courseCompletionService', () => ({
  courseCompletionService: {
    getCourseProgress: vi.fn(),
    getCourseApplications: vi.fn(),
    applyForCertificate: vi.fn(),
  },
}));

// Stub heavy sub-components not under test
vi.mock('../components/StudentWalletStatusCard', () => ({ default: () => null }));
vi.mock('../components/dashboard/QuickActionsGrid', () => ({ default: () => null }));
vi.mock('../components/dashboard/DashboardHero', () => ({ default: () => null }));
vi.mock('../components/dashboard/NftBadgesSection', () => ({ default: () => null }));
vi.mock('../components/dashboard/LmsCertificatesSection', () => ({ default: () => null }));
vi.mock('../components/AnnouncementsPanel', () => ({ AnnouncementsPanel: () => null }));
vi.mock('../components/dashboard/RecentSubmissionsCard', () => ({ default: () => null }));
vi.mock('../components/dashboard/EngagementStats', () => ({ default: () => null }));

// OnboardingChecklist: render hasApplied as a testable data-testid value.
// This allows R7 tests to assert the exact hasApplied value (true/false/null) derived
// from appStatusMap without parsing complex UI structure or depending on localStorage
// dismissal logic, which starts with checklistDismissed=true and requires a useEffect.
vi.mock('../components/dashboard/OnboardingChecklist', () => ({
  default: ({ hasApplied }: any) => (
    <div data-testid="checklist-has-applied">
      {hasApplied === null ? 'null' : String(hasApplied)}
    </div>
  ),
}));

// ──── Imports after mocks ─────────────────────────────────────────────────────

import { useAuth } from '../context/useAuth';
import { useData } from '../context/DataContext';
import { quizService } from '../services/quizService';
import { courseService } from '../services/courseService';
import { courseCompletionService } from '../services/courseCompletionService';
import StudentDashboard from '../pages/StudentDashboard';

// ──── Auth / data helpers ─────────────────────────────────────────────────────

/**
 * Creates a NEW User object on each call, even for the same userId.
 * This matches AuthProvider.refresh()'s setUser(response.data.data) where
 * JSON.parse(JSON.stringify(...)) always returns a new object reference.
 * React's Object.is comparison fails for two distinct objects → courses
 * effect dependency [user, coursesRetryCount] changes → effect re-runs.
 */
function makeUserMock(userId = 'student1') {
  return {
    user: {
      id: userId,
      name: 'Student User',
      email: 'student@example.com',
      role: 'student',
      walletAddress: null,
      walletLinkingStatus: 'none' as const,
      workspaces: ['student'],
      defaultWorkspace: 'student',
      permissions: [],
    } as any,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  } as any;
}

function setStudentData() {
  vi.mocked(useData).mockReturnValue({
    submissions: [],
    submissionsLoading: false,
    submissionsError: null,
    fetchSubmissions: vi.fn(),
  } as any);
}

// ──── Course / progress / app fixtures ───────────────────────────────────────

const course1 = {
  id: 'c1', title: 'Intro to Blockchain', courseCode: 'BC101',
  description: '', status: 'active',
};

const progressEligible: any = {
  canApplyForCertificate: true,
  completedLessonItems: 5,
  totalLessonItems: 5,
  lessonPercentage: 100,
  allRequiredQuizzesPassed: true,
  requiredQuizzes: [],
  hasApprovedSubmission: true,
};

function makePendingApp(courseId = 'c1'): any[] {
  return [{
    id: 'app1', courseId, userId: 'student1', status: 'pending',
    walletAddress: null, reviewNotes: null, txHash: null, mintError: null,
  }];
}

// ──── Render / rerender helpers ───────────────────────────────────────────────

function renderStudent() {
  return render(
    <MemoryRouter initialEntries={['/student']}>
      <StudentDashboard />
    </MemoryRouter>,
  );
}

function rerenderedStudent(rerender: (ui: React.ReactElement) => void) {
  rerender(
    <MemoryRouter initialEntries={['/student']}>
      <StudentDashboard />
    </MemoryRouter>,
  );
}

// ──── Shared beforeEach ───────────────────────────────────────────────────────

function commonBeforeEach() {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue(makeUserMock('student1'));
  setStudentData();
  vi.mocked(quizService.getCompletionsForUser).mockResolvedValue([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 — Same-user auth refresh triggers courses-effect full replace during mutation
//
// Auth refresh model: makeUserMock('student1') called twice returns two distinct
// objects with the same id. This models AuthProvider.refresh() → setUser(data)
// where `data` is always a new object from JSON deserialization. React's Object.is
// comparison sees a new value → courses effect [user, coursesRetryCount] re-runs.
//
// Synchronization: after resolving the controlled promises, wait for 'Intro to
// Blockchain' to reappear in the DOM — this indicates coursesLoading has returned
// to false (courses effect fully settled) so all state updates have committed.
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R7 T1 — same-user auth refresh full replace during in-flight mutation', () => {
  beforeEach(commonBeforeEach);

  it('T1a: mutation commits before stale courses refetch → hasApplied wiped (DEFECT → GREEN with fix)', async () => {
    // Schedule 1A: M resolves first (mutation commits), then Q resolves empty (stale).
    //
    // Without fix: setAppStatusMap({ c1: null }) — full replace wipes { c1: pendingApp }
    //              → hasApplied=false (defect: checklist shows "Apply for cert" as undone)
    // With fix:    functional update sees prev[c1]=pendingApp, newApps[c1]=null → preserves
    //              → hasApplied=true
    //
    // Note: certState.c1='applied' (set when M resolves) protects the cert section display
    // regardless of fix, so the cert section looks correct in both cases. The ONLY user-
    // visible difference is the checklist (hasApplied) — a subtler but real defect.

    let resolveMutation!: (v: any) => void;
    const mutationPromise = new Promise<any>((res) => { resolveMutation = res; });

    let resolveRefetch!: (v: any[]) => void;
    const refetchPromise = new Promise<any[]>((res) => { resolveRefetch = res; });

    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockResolvedValueOnce([])                            // call 1: initial load — no app
      .mockReturnValueOnce(refetchPromise as any)           // call 2: auth-refresh load — held
      .mockResolvedValue([]);                               // fallback for any extra calls
    vi.mocked(courseCompletionService.applyForCertificate)
      .mockReturnValue(mutationPromise as any);

    const { rerender } = renderStudent();

    // Initial load settles: eligible cert button visible
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument()
    );

    // User clicks cert button — mutation M in-flight
    fireEvent.click(screen.getByRole('button', { name: /request certificate/i }));
    await new Promise((r) => setTimeout(r, 0));

    // Simulate same-user auth refresh: new User object, same id 'student1'.
    // Models AuthProvider.refresh() → api.get('/auth/me') → setUser(response.data.data).
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student1'));
    rerenderedStudent(rerender);

    // Allow React to process effects: courses effect re-runs, getCourseApplications
    // second call returns refetchPromise (held — stale server read pending).
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // ORDER A: Mutation M commits FIRST (before the stale courses refetch resolves).
    // handleAppStatusChange merges { c1: pendingApp } into appStatusMap.
    resolveMutation(makePendingApp('c1')[0]);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Auth-refresh courses-effect refetch resolves empty (stale — server had not reflected
    // the mutation when the refetch was issued).
    resolveRefetch([]);

    // Wait for courses effect to fully settle: 'Intro to Blockchain' reappears in the DOM
    // (coursesLoading → false after .finally()). This ensures setAppStatusMap and all other
    // state updates from the courses effect .then() have been processed by React before we
    // assert the hasApplied value.
    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // GREEN after fix: preservation guard keeps { c1: pendingApp } → hasApplied=true
    // RED without fix: full replace produces { c1: null } → hasApplied=false
    expect(screen.getByTestId('checklist-has-applied').textContent).toBe('true');
  });

  it('T1b: courses refetch resolves before mutation → no regression with fix', async () => {
    // Schedule 1B (inverse order): Q resolves empty first, then M commits.
    // When Q fires, prev[c1] is null (M has not committed yet).
    // Preservation guard condition: newApps[c1]=null AND prev[c1] != null → FALSE.
    // So courses effect sets { c1: null } (same as old code). Then M commits via
    // handleAppStatusChange merge → { c1: pendingApp }.
    // hasApplied=true in both old code and new code. No regression.

    let resolveMutation!: (v: any) => void;
    const mutationPromise = new Promise<any>((res) => { resolveMutation = res; });

    let resolveRefetch!: (v: any[]) => void;
    const refetchPromise = new Promise<any[]>((res) => { resolveRefetch = res; });

    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(refetchPromise as any)
      .mockResolvedValue([]);
    vi.mocked(courseCompletionService.applyForCertificate)
      .mockReturnValue(mutationPromise as any);

    const { rerender } = renderStudent();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /request certificate/i }));
    await new Promise((r) => setTimeout(r, 0));

    // Same-user auth refresh
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student1'));
    rerenderedStudent(rerender);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // ORDER B: courses refetch (Q) resolves FIRST with empty.
    // prev[c1] is null (M has not committed) → preservation guard does NOT apply.
    // appStatusMap = { c1: null } after courses effect.
    resolveRefetch([]);

    // Wait for courses effect to settle
    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // At this point appStatusMap = { c1: null } and certState.c1 = 'loading' (M still in flight)
    await new Promise((r) => setTimeout(r, 0));

    // Then mutation (M) commits — handleAppStatusChange merges { c1: pendingApp }
    resolveMutation(makePendingApp('c1')[0]);

    // hasApplied should become true (same in old and new code — no regression)
    await waitFor(() =>
      expect(screen.getByTestId('checklist-has-applied').textContent).toBe('true')
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — Auth refresh with already-pending application: stale empty must not
//       reinstate the eligible/"Request certificate" state.
//
// Demonstrates a second defect from the same root cause: an auth-refresh-triggered
// courses effect with a stale empty response can wipe a confirmed pending application
// that was loaded in the initial courses fetch (no active mutation involved).
// Without the preservation guard, the cert button reappears and hasApplied=false
// even though the application was already found and shown before the refresh.
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R7 T2 — auth refresh with already-pending app: stale empty must not wipe', () => {
  beforeEach(commonBeforeEach);

  it('T2: already-pending + auth-refresh stale empty → pending status preserved', async () => {
    // Initial load: server returns existing pending app → appStatusMap = { c1: pendingApp }.
    // Auth refresh fires. Courses effect re-runs. getCourseApplications returns empty (stale).
    //
    // Without fix: setAppStatusMap({ c1: null }) — cert button reappears, hasApplied=false.
    // With fix:    functional update preserves { c1: pendingApp } — "Application pending"
    //              stays, no cert button, hasApplied=true.
    //
    // Note: certState is empty (no button click happened in this session), so without
    // fix the cert section ALSO shows the wrong state (eligible, cert button visible) —
    // a more severe presentation than T1a where certState protects the cert section.

    let resolveRefetch!: (v: any[]) => void;
    const refetchPromise = new Promise<any[]>((res) => { resolveRefetch = res; });

    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockResolvedValueOnce(makePendingApp('c1'))          // call 1: initial — pending app
      .mockReturnValueOnce(refetchPromise as any)           // call 2: auth-refresh — held (stale)
      .mockResolvedValue(makePendingApp('c1'));              // fallback

    const { rerender } = renderStudent();

    // Initial load: pending app confirmed → "Application pending" shown
    await waitFor(() =>
      expect(screen.getByText(/application pending/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
    expect(screen.getByTestId('checklist-has-applied').textContent).toBe('true');

    // Same-user auth refresh
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student1'));
    rerenderedStudent(rerender);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Auth-refresh courses refetch returns empty (stale read — replica lag)
    resolveRefetch([]);

    // Wait for courses effect to fully settle: course card reappears (coursesLoading → false).
    // This ensures setAppStatusMap has committed before we assert.
    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // GREEN after fix: preserved pendingApp → hasApplied=true, no cert button
    // RED without fix: null → hasApplied=false, cert button reappears
    expect(screen.getByTestId('checklist-has-applied').textContent).toBe('true');
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — 409 recovery: re-fetch commit must not be wiped by concurrent
//       auth-refresh courses-effect full replace.
//
// The 409 handler in CertEligibilitySection calls getCourseApplications to
// re-fetch the existing application after a conflict. This re-fetch has NO
// cancellation guard. If an auth-refresh courses effect fires concurrently
// and resolves later with empty, the full replace wipes the 409 re-fetch commit.
//
// getCourseApplications call sequence in this test:
//   call 1 (initial courses effect)  → [] (no app visible — stale initial read)
//   call 2 (409 handler re-fetch, R) → held — 409 catch: re-fetch existing app
//   call 3 (auth-refresh courses Q)  → held — concurrent stale courses refetch
//
// Resolution order: R resolves (app commits), then Q resolves empty (wipes).
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R7 T3 — 409 recovery commit + auth-refresh full replace', () => {
  beforeEach(commonBeforeEach);

  it('T3: 409 recovery re-fetch commits app; auth-refresh stale empty wipes it (DEFECT → GREEN)', async () => {
    let resolveR!: (v: any[]) => void;
    const promiseR = new Promise<any[]>((res) => { resolveR = res; });

    let resolveQ!: (v: any[]) => void;
    const promiseQ = new Promise<any[]>((res) => { resolveQ = res; });

    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockResolvedValueOnce([])              // call 1: initial — no app (stale)
      .mockReturnValueOnce(promiseR as any)   // call 2: 409 re-fetch — held
      .mockReturnValueOnce(promiseQ as any)   // call 3: auth-refresh courses — held
      .mockResolvedValue([]);                 // fallback

    // applyForCertificate throws 409 — server already has this application
    vi.mocked(courseCompletionService.applyForCertificate).mockRejectedValue(
      Object.assign(new Error('Conflict'), { response: { status: 409 } }),
    );

    const { rerender } = renderStudent();

    // Initial load: no app visible (stale read) → cert button shown
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument()
    );

    // User clicks cert button → applyForCertificate throws 409.
    // 409 catch: certState.c1='applied', then getCourseApplications(c1) → call 2 (promiseR, held).
    fireEvent.click(screen.getByRole('button', { name: /request certificate/i }));

    // Allow 409 handler async execution to start (so call 2 is consumed before call 3)
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Simulate same-user auth refresh AFTER 409 handler started R.
    // Courses effect restarts → getCourseApplications → call 3 (promiseQ, held).
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student1'));
    rerenderedStudent(rerender);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // R resolves: 409 re-fetch returns existing pending application.
    // onAppStatusChange(c1, pendingApp) → appStatusMap = { c1: pendingApp }.
    resolveR(makePendingApp('c1'));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Q resolves empty: courses effect settles with stale empty.
    // Without fix: setAppStatusMap({ c1: null }) — wipes R's commit → hasApplied=false.
    // With fix:    preservation guard keeps { c1: pendingApp } → hasApplied=true.
    resolveQ([]);

    // Wait for courses effect to fully settle (coursesLoading → false, course card back)
    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // GREEN after fix: preserved pendingApp → hasApplied=true
    expect(screen.getByTestId('checklist-has-applied').textContent).toBe('true');

    // Cert button must not reappear: certState.c1='applied' AND appStatusMap has pendingApp
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — Account replacement: old user's in-flight courses refetch is cancelled;
//       new user's state is clean.
//
// Distinguishes same-user auth refresh (T1: same generation, new ref, NO
// cancellation of in-flight courses fetch) from account replacement (different
// userId, cancelled=true set when courses effect cleanup fires on user change).
//
// When user A switches to user B (different id), the courses effect's cleanup
// fires cancelled=true. User A's in-flight getCourseApplications cannot commit
// its results to appStatusMap (the .then() bails at if (!cancelled) check).
// User B gets clean state from their own courses effect.
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R7 T4 — account replacement cancels old user courses refetch', () => {
  beforeEach(commonBeforeEach);

  it('T4: user A courses refetch in-flight → switch to user B → stale refetch cancelled, user B clean', async () => {
    // User A: initial load, then same-user auth refresh triggers a courses refetch (held).
    // Before the refetch settles, user switches to user B (different id — account replacement).
    // Courses effect cleanup fires: cancelled=true for user A's in-flight refetch.
    // User A's stale fetch cannot commit pendingApp to user B's appStatusMap.
    // User B gets clean state from their own courses effect (no courses enrolled).

    let resolveUserARefetch!: (v: any[]) => void;
    const userARefetchPromise = new Promise<any[]>((res) => { resolveUserARefetch = res; });

    vi.mocked(courseService.fetchCourses)
      .mockResolvedValueOnce([course1] as any)   // user A initial load
      .mockResolvedValueOnce([course1] as any)   // user A auth-refresh fetchCourses
      .mockResolvedValue([]);                    // user B: no courses enrolled

    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockResolvedValueOnce([])                              // user A initial load
      .mockReturnValueOnce(userARefetchPromise as any)        // user A auth-refresh: held
      .mockResolvedValue([]);                                 // user B: no apps

    const { rerender } = renderStudent();

    // User A: initial load settles — cert button visible (eligible, no app)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument()
    );
    expect(screen.getByTestId('checklist-has-applied').textContent).toBe('false');

    // Same-user auth refresh for user A: courses effect re-runs.
    // getCourseApplications (call 2) returns userARefetchPromise (held).
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student1'));
    rerenderedStudent(rerender);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Account replacement: user switches to user B (different id 'student2').
    // Courses effect cleanup fires: cancelled=true for user A's in-flight refetch.
    // User B's courses effect starts and quickly settles (no courses → appStatusMap={}).
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student2'));
    rerenderedStudent(rerender);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // Resolve user A's stale refetch with a pending app.
    // The cancelled=true guard in the courses effect .then() must bail —
    // user A's pendingApp must NOT update user B's appStatusMap.
    resolveUserARefetch(makePendingApp('c1'));

    // Allow any async processing to settle
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // User B has no courses → appStatusMap={} → hasApplied=false.
    // If cancelled guard works: userA's pendingApp was NOT committed → 'false'.
    // If cancelled guard failed: { c1: pendingApp } would be committed → 'true'.
    await waitFor(() =>
      expect(screen.getByTestId('checklist-has-applied').textContent).toBe('false')
    );

    // User A's course card must not appear for user B
    expect(screen.queryByText('Intro to Blockchain')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — Courses fetch error during auth refresh → hasApplied null, not false
//
// If fetchCourses itself fails (network error / 5xx) during an auth-refresh-
// triggered courses effect, coursesError is set and hasApplied must be null
// (indeterminate), not false. A failed load must not silently claim the student
// has no application — that would falsely mark the checklist step as incomplete.
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R7 T5 — courses fetch error during auth refresh → hasApplied null', () => {
  beforeEach(commonBeforeEach);

  it('T5: auth-refresh courses effect fetchCourses fails → hasApplied=null (not false)', async () => {
    // Initial load succeeds with pending app → appStatusMap = { c1: pendingApp }, hasApplied=true.
    // Auth refresh fires. Courses effect re-runs. fetchCourses throws (network error).
    // coursesError is set. hasApplied derivation: coursesError ? null : ...
    // → must be null (not false) — failed load is indeterminate, not confirmed-empty.

    vi.mocked(courseService.fetchCourses)
      .mockResolvedValueOnce([course1] as any)              // initial: succeeds
      .mockRejectedValueOnce(new Error('Network error'));   // auth-refresh: fails

    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockResolvedValue(makePendingApp('c1'));              // initial: pending app

    const { rerender } = renderStudent();

    // Initial load: pending app found → hasApplied=true
    await waitFor(() =>
      expect(screen.getByTestId('checklist-has-applied').textContent).toBe('true')
    );

    // Same-user auth refresh → courses effect re-runs → fetchCourses fails
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student1'));
    rerenderedStudent(rerender);

    // After courses fetch error: coursesError != null → hasApplied derivation returns null.
    // Must NOT fall to 'false' (that would falsely mark the step as incomplete).
    await waitFor(() => {
      expect(screen.getByTestId('checklist-has-applied').textContent).toBe('null');
    });
  });
});
describe('Independent account isolation review', () => {
  beforeEach(() => { vi.resetAllMocks(); commonBeforeEach(); });
  it('does not carry the prior user application to the next user for the same course', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValueOnce(makePendingApp() as any).mockResolvedValue([]);
    const { rerender } = renderStudent();
    await waitFor(() => expect(screen.getByTestId('checklist-has-applied').textContent).toBe('true'));
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student2'));
    rerenderedStudent(rerender);
    await waitFor(() => expect(courseCompletionService.getCourseApplications).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('checklist-has-applied').textContent).toBe('false'));
  });
  it('does not apply an old user mutation result to the next user', async () => {
    let resolveApplication!: (value: any) => void;
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);
    vi.mocked(courseCompletionService.applyForCertificate).mockReturnValue(new Promise((resolve) => { resolveApplication = resolve; }));
    const { rerender } = renderStudent();
    fireEvent.click(await screen.findByRole('button', { name: /request certificate/i }));
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student2'));
    rerenderedStudent(rerender);
    await waitFor(() => expect(courseCompletionService.getCourseApplications).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: /request certificate/i });
    await act(async () => { resolveApplication(makePendingApp()[0]); });
    await waitFor(() => expect(screen.getByTestId('checklist-has-applied').textContent).toBe('false'));
    expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument();
  });
});

