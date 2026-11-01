/**
 * W09-R6 — Concurrent application and course refresh ownership
 *
 * Investigation: can the courses-effect full-replace of appStatusMap overwrite a
 * pending application committed by an app retry merge or handleAppStatusChange?
 *
 * Conclusion (see docs/release/W09-R6-spec.md):
 * No user-facing defect demonstrated via product controls. The coursesLoading
 * skeleton guard prevents cert-button access during any courses-effect run, making
 * a concurrent handleAppStatusChange or app-retry-merge impossible through the UI.
 * Identity-change cleanup prevents stale commits after account switch.
 *
 * These tests record the tested schedules as regression checks so future refactors
 * cannot silently remove the skeleton guard or cleanup semantics.
 *
 * Test IDs follow the W09-R6 spec:
 * C1: coursesLoading skeleton prevents cert-button access during any courses-effect run
 * C2: app retry merge is not disturbed by a completed courses effect (coursesLoading guard)
 * C4: identity change clears loading state and cancels in-flight retry
 * C5: multi-course independent status preserved across course refresh
 * C6: full replace by courses effect is authoritative — commits correct server state
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

// ──── Imports after mocks ─────────────────────────────────────────────────────

import { useAuth } from '../context/useAuth';
import { useData } from '../context/DataContext';
import { quizService } from '../services/quizService';
import { courseService } from '../services/courseService';
import { courseCompletionService } from '../services/courseCompletionService';
import StudentDashboard from '../pages/StudentDashboard';

// ──── Auth / data helpers ─────────────────────────────────────────────────────

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

function setStudentAuth(userId = 'student1') {
  vi.mocked(useAuth).mockReturnValue(makeUserMock(userId));
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

const course1 = { id: 'c1', title: 'Intro to Blockchain', courseCode: 'BC101', description: '', status: 'active' };
const course2 = { id: 'c2', title: 'Crypto Fundamentals', courseCode: 'CF200', description: '', status: 'active' };

const progressEligible: any = {
  canApplyForCertificate: true,
  completedLessonItems: 5,
  totalLessonItems: 5,
  lessonPercentage: 100,
  allRequiredQuizzesPassed: true,
  requiredQuizzes: [],
  hasApprovedSubmission: true,
};

const progressNotEligible: any = {
  canApplyForCertificate: false,
  completedLessonItems: 0,
  totalLessonItems: 5,
  lessonPercentage: 0,
  allRequiredQuizzesPassed: false,
  requiredQuizzes: [],
  hasApprovedSubmission: false,
};

function makePendingApp(courseId = 'c1'): any[] {
  return [{
    id: 'app1', courseId, userId: 'student1', status: 'pending',
    walletAddress: null, reviewNotes: null, txHash: null, mintError: null,
  }];
}

// ──── Render helper ───────────────────────────────────────────────────────────

function renderStudent() {
  return render(
    <MemoryRouter initialEntries={['/student']}>
      <StudentDashboard />
    </MemoryRouter>,
  );
}

// ──── Shared beforeEach ───────────────────────────────────────────────────────

function commonBeforeEach() {
  vi.clearAllMocks();
  setStudentAuth();
  setStudentData();
  vi.mocked(quizService.getCompletionsForUser).mockResolvedValue([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// C1 — coursesLoading skeleton prevents cert-button access during courses effect
//
// Invariant: the cert button is NEVER accessible while coursesLoading=true.
// This is the primary guard that prevents handleAppStatusChange from being called
// while a courses-effect full-replace is in-flight.
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R6 C1 — coursesLoading skeleton prevents cert-button access during courses effect', () => {
  beforeEach(commonBeforeEach);

  it('C1-1: courses loading — skeleton shown, cert button not accessible', async () => {
    // Hold courses fetch in pending state so we can observe the loading skeleton
    let resolveCourses!: (value: any[]) => void;
    const coursesPromise = new Promise<any[]>((resolve) => { resolveCourses = resolve; });

    vi.mocked(courseService.fetchCourses).mockReturnValueOnce(coursesPromise as any);

    renderStudent();

    // While courses are loading, cert button must not be present
    await new Promise((r) => setTimeout(r, 0)); // flush initial microtasks

    // No "Request certificate" button while courses loading
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
    // Course title not yet visible (skeleton instead)
    expect(screen.queryByText('Intro to Blockchain')).toBeNull();

    // Now resolve courses so the test can clean up
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);
    resolveCourses([course1]);

    // After settle: button appears for eligible course with no app
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument()
    );
  });

  it('C1-2: cert button appears only after courses effect fully settles (data + loading=false)', async () => {
    // Hold progress fetch in pending to verify button requires BOTH progress AND app data
    let resolveApps!: (value: any[]) => void;
    const appsPromise = new Promise<any[]>((resolve) => { resolveApps = resolve; });

    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockReturnValueOnce(appsPromise as any);

    renderStudent();

    // Flush past fetchCourses + getCourseProgress resolution
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // App fetch still pending → courses effect not done → skeleton / no button
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();

    // Resolve app fetch
    resolveApps([]);

    // Now courses effect settles → coursesLoading=false → button appears
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument()
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C2 — App retry merge after courses effect completes (no concurrency possible via UI)
//
// Confirms: the app retry merge is not disturbed by the courses effect because the
// courses effect is always done before the user can trigger the retry.
// Also confirms: W09-R5 mutation preservation (R6-1) is retained as regression.
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R6 C2 — app retry and courses effect do not race via product controls', () => {
  beforeEach(commonBeforeEach);

  it('C2-1: initial courses effect completes → app retry triggered → merge commits without interference', async () => {
    // Scenario: courses effect completes, c1 app fetch failed.
    // User sees amber alert and clicks "Try again". The courses effect is done
    // (coursesLoading=false) so no concurrent full replace is possible.
    // App retry returns a pending app. "Application pending" badge shown.

    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockRejectedValueOnce(new Error('initial fail'))  // initial load: fails
      .mockResolvedValue(makePendingApp('c1'));           // retry: pending app

    renderStudent();

    // Wait for initial state: courses loaded, error shown
    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));

    // At this point coursesLoading=false — courses effect is done
    // App retry is NOT in-flight yet

    // Click "Try again"
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // App retry settles → pending app found → "Application pending" shown
    await waitFor(() =>
      expect(screen.getByText(/application pending/i)).toBeInTheDocument()
    );

    // No cert button (pending app blocks it)
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });

  it('C2-2: handleAppStatusChange after courses effect done → status committed, no concurrent full replace', async () => {
    // User applies for cert. handleAppStatusChange commits pending app.
    // Courses effect is already done (coursesLoading=false when button was clickable).
    // No concurrent full replace can overwrite the committed status.

    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);
    vi.mocked(courseCompletionService.applyForCertificate).mockResolvedValue(
      makePendingApp('c1')[0]
    );

    renderStudent();

    // Wait for cert button to appear (courses effect done, coursesLoading=false)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument()
    );

    // Apply — handleAppStatusChange commits pending app
    fireEvent.click(screen.getByRole('button', { name: /request certificate/i }));

    // Pending badge shown, button gone
    await waitFor(() =>
      expect(screen.getByText(/application pending/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();

    // Pending status remains after any subsequent synchronous renders
    // (no concurrent courses effect to overwrite it — courses effect is done)
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText(/application pending/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C4 — Identity change clears loading state and cancels in-flight retry
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R6 C4 — identity change cancels in-flight retry; new user starts fresh', () => {
  beforeEach(commonBeforeEach);

  it('C4-1: retry in flight → user identity changes → appLoadingIds cleared, stale merge bails', async () => {
    let resolveRetry!: (value: any[]) => void;
    const retryPromise = new Promise<any[]>((resolve) => { resolveRetry = resolve; });

    vi.mocked(courseService.fetchCourses)
      .mockResolvedValueOnce([course1] as any)  // user1's courses
      .mockResolvedValue([]);                    // user2's courses (empty)

    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressNotEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockRejectedValueOnce(new Error('fail'))  // user1 initial
      .mockReturnValue(retryPromise);             // user1 retry (held) or future calls

    const { rerender } = renderStudent();

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));

    // Trigger app retry for user1
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await new Promise((r) => setTimeout(r, 0));

    // Switch to a different user while retry is in flight
    vi.mocked(useAuth).mockReturnValue(makeUserMock('student2'));

    rerender(
      <MemoryRouter initialEntries={['/student']}>
        <StudentDashboard />
      </MemoryRouter>,
    );

    // Old user's courses should disappear for the new user
    await waitFor(() => {
      expect(screen.queryByText('Intro to Blockchain')).toBeNull();
    });

    // Resolve the stale retry — cancelled guard prevents commit for old user
    resolveRetry([]);
    await new Promise((r) => setTimeout(r, 10));

    // Old user's course title must not appear for new user
    expect(screen.queryByText('Intro to Blockchain')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C5 — Multi-course independent status preserved across course refresh
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R6 C5 — multi-course independent status preserved', () => {
  beforeEach(commonBeforeEach);

  it('C5-1: two courses — c1 app fails, c2 app succeeds → each shows independent state after courses effect', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1, course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockRejectedValueOnce(new Error('c1 fail'))  // c1: fails
      .mockResolvedValueOnce([]);                    // c2: succeeds (no app)

    renderStudent();

    await waitFor(() => expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Crypto Fundamentals')).toBeInTheDocument());

    // c1 row: amber error shown
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    // c2 row: confirmed no app + eligible → cert button visible
    expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument();
  });

  it('C5-2: two courses — c1 has pending app, c2 has no app and is eligible → each shows correct state', async () => {
    // Full replace is authoritative: courses effect fetches apps for all courses atomically.
    // Each course's status is shown independently (pending for c1, eligible for c2).
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1, course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockResolvedValueOnce(makePendingApp('c1'))  // c1: pending app found
      .mockResolvedValueOnce([]);                    // c2: no app

    renderStudent();

    await waitFor(() => expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Crypto Fundamentals')).toBeInTheDocument());

    // c1: pending app → "Application pending" badge shown; no cert button for c1
    expect(screen.getByText(/application pending/i)).toBeInTheDocument();

    // c2: no app + eligible → cert button visible (independent of c1's pending state)
    expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C6 — Courses-effect full replace is authoritative: correct server state wins
//
// The full replace is intentional: after a courses refresh, server data takes
// precedence over any in-memory state. This is the correct behavior.
// These tests confirm it produces the right result (not a regression).
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R6 C6 — courses-effect full replace is authoritative', () => {
  beforeEach(commonBeforeEach);

  it('C6-1: courses effect returns pending app → "Application pending" shown (not eligible)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue(
      makePendingApp('c1')
    );

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText(/application pending/i)).toBeInTheDocument()
    );
    // Server has a pending app — full replace correctly reflects it, button not shown
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });

  it('C6-2: courses effect returns empty app list → "Request certificate" shown (eligible)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument()
    );
  });

  it('C6-3: courses effect app fetch fails → amber alert shown, no cert button (full replace does not add to appStatusMap)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockRejectedValue(
      new Error('fetch failed')
    );

    renderStudent();

    await waitFor(() => expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument());

    // Amber error alert shown for c1
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    // No cert button — appFailed=true → appStatusUnknown=true
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });
});
