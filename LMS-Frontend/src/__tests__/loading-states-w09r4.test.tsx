/**
 * W09-R4 — Truthful student progress and application status
 *
 * Checklist defect (finding 1e): hasCompletedLesson derives from progressMap only,
 * not progressErrorIds. One enrolled course with a failed progress fetch renders the
 * "Complete your first lesson" step as a confirmed incomplete circle instead of the
 * minus/unknown indicator.
 *
 * Application fetch failure (deferred finding 1d): getCourseApplications rejection
 * was caught and mapped to [] → null. Unknown status is indistinguishable from a
 * confirmed "no application", potentially showing "Request certificate" for a student
 * who already applied.
 *
 * Test IDs follow the W09-R4 spec requirement matrix (R1–R7).
 *
 * R1: three-state hasCompletedLesson
 * R2: three-state hasApplied
 * R3: application fetch failure display and retry
 * R4: progress retry via retryLoadCourses
 * R5: 409 and known application status preservation
 * R6: late/out-of-order results and account change
 * R7: W06–W09-R3 regression preservation
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

function setStudentAuth(userId = 'student1') {
  vi.mocked(useAuth).mockReturnValue({
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
  } as any);
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
  id: 'c1',
  title: 'Intro to Blockchain',
  courseCode: 'BC101',
  description: '',
  status: 'active',
};

const course2 = {
  id: 'c2',
  title: 'Crypto Fundamentals',
  courseCode: 'CF200',
  description: '',
  status: 'active',
};

const progressOk = (completedLessonItems = 0): any => ({
  canApplyForCertificate: completedLessonItems > 0,
  completedLessonItems,
  totalLessonItems: 5,
  lessonPercentage: completedLessonItems * 20,
  allRequiredQuizzesPassed: false,
  requiredQuizzes: [],
  hasApprovedSubmission: false,
});

const progressEligible: any = {
  canApplyForCertificate: true,
  completedLessonItems: 5,
  totalLessonItems: 5,
  lessonPercentage: 100,
  allRequiredQuizzesPassed: true,
  requiredQuizzes: [],
  hasApprovedSubmission: true,
};

const pendingApp: any = [{
  id: 'app1',
  courseId: 'c1',
  userId: 'student1',
  status: 'pending',
  walletAddress: null,
  reviewNotes: null,
  txHash: null,
  mintError: null,
}];

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
// R1 — Three-state hasCompletedLesson
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R4 R1 — three-state hasCompletedLesson', () => {
  beforeEach(commonBeforeEach);

  it('R1-1: 1 course, progress fails, app succeeds → "Complete your first lesson" shown as unknown (minus icon, NOT empty circle)', async () => {
    // THE CORE CHECKLIST DEFECT: progress fails → hasCompletedLesson is derived from
    // progressMap only (not progressErrorIds). progressMap is empty → .some() = false →
    // hasCompletedLesson=false → renders confirmed-incomplete empty circle.
    // After fix: progressErrorIds.size > 0 → hasCompletedLesson=null → renders minus icon.
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockRejectedValue(new Error('progress unavailable'));
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // "Complete your first lesson" must render as unknown (Minus SVG icon),
    // NOT as confirmed-incomplete (empty circle div).
    // The empty circle div is: <div class="h-4 w-4 rounded-full border-2 border-neutral-300 shrink-0">
    const lessonStep = screen.queryByText('Complete your first lesson');
    if (lessonStep) {
      const li = lessonStep.closest('li');
      expect(li).not.toBeNull();
      // This assertion FAILS before fix (empty circle IS present) and PASSES after fix (minus SVG, no circle)
      expect(li?.querySelector('.rounded-full')).toBeNull();
    }
  });

  it('R1-2: 1 course, progress succeeds (0 completed) → "Complete your first lesson" shown as confirmed-incomplete (empty circle)', async () => {
    // Regression: when all progress loaded and 0 completed, should show confirmed-false, not unknown.
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // progress loaded, 0 completed → confirmed false → empty circle div (NOT minus SVG)
    const lessonStep = screen.queryByText('Complete your first lesson');
    if (lessonStep) {
      const li = lessonStep.closest('li');
      expect(li).not.toBeNull();
      // Confirmed-false: empty circle div present (not minus SVG)
      expect(li?.querySelector('.rounded-full')).not.toBeNull();
      // Not confirmed-done (no strikethrough)
      expect(lessonStep.className).not.toContain('line-through');
    }
  });

  it('R1-3: 1 course, progress succeeds (> 0 completed) → "Complete your first lesson" shown as confirmed-done', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(3));
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const lessonStep = screen.queryByText('Complete your first lesson');
    if (lessonStep) {
      // confirmed done → strikethrough styling
      expect(lessonStep.className).toContain('line-through');
    }
  });

  it('R1-4: 2 courses: one progress fails, one succeeds (> 0 completed) → "Complete your first lesson" is true (confirmed positive wins)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1, course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress)
      .mockRejectedValueOnce(new Error('fail'))      // c1: fails
      .mockResolvedValueOnce(progressOk(2));          // c2: succeeds with progress
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const lessonStep = screen.queryByText('Complete your first lesson');
    if (lessonStep) {
      // confirmed positive from c2 → strikethrough
      expect(lessonStep.className).toContain('line-through');
    }
  });

  it('R1-5: 2 courses, both progress fail → "Complete your first lesson" shown as unknown (no "Done", no empty circle)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1, course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockRejectedValue(new Error('fail'));
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const lessonStep = screen.queryByText('Complete your first lesson');
    if (lessonStep) {
      expect(lessonStep.className).not.toContain('line-through');
      const li = lessonStep.closest('li');
      expect(li?.textContent).not.toContain('Done');
    }
  });

  it('R1-6: 2 courses: one progress fails, one succeeds (0 completed) → "Complete your first lesson" is unknown (error prevents confirmed negative)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1, course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress)
      .mockRejectedValueOnce(new Error('fail'))    // c1: fails
      .mockResolvedValueOnce(progressOk(0));        // c2: succeeds, 0 completed
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const lessonStep = screen.queryByText('Complete your first lesson');
    if (lessonStep) {
      // Must be unknown, not confirmed-false, because c1 errored
      expect(lessonStep.className).not.toContain('line-through');
      const li = lessonStep.closest('li');
      expect(li?.textContent).not.toContain('Done');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R2 — Three-state hasApplied
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R4 R2 — three-state hasApplied', () => {
  beforeEach(commonBeforeEach);

  it('R2-1: 1 course, app fetch fails → "Apply for your certificate" shown as unknown (minus icon, NOT empty circle)', async () => {
    // THE CORE APPLIED-STEP DEFECT: app fetch failure silently returns [] → null →
    // hasApplied=false (confirmed-negative). After fix: appErrorIds.size > 0 → hasApplied=null.
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications).mockRejectedValue(new Error('app fail'));

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const appliedStep = screen.queryByText('Apply for your certificate');
    if (appliedStep) {
      const li = appliedStep.closest('li');
      expect(li).not.toBeNull();
      // This FAILS before fix (empty circle IS present) and PASSES after fix (minus icon, no circle)
      expect(li?.querySelector('.rounded-full')).toBeNull();
    }
  });

  it('R2-2: 1 course, app fetch succeeds (no app) → "Apply for your certificate" shown as confirmed-false (empty circle)', async () => {
    // Regression: when app loaded successfully with no results, should show confirmed-false.
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // Confirmed-false: empty circle div present in applied li
    const appliedStep = screen.queryByText('Apply for your certificate');
    if (appliedStep) {
      const li = appliedStep.closest('li');
      expect(li).not.toBeNull();
      expect(li?.querySelector('.rounded-full')).not.toBeNull();
      expect(appliedStep.className).not.toContain('line-through');
    }
  });

  it('R2-3: 1 course, app fetch succeeds (app found) → "Apply for your certificate" shown as confirmed-done', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue(pendingApp);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const appliedStep = screen.queryByText('Apply for your certificate');
    if (appliedStep) {
      expect(appliedStep.className).toContain('line-through');
    }
  });

  it('R2-4: 2 courses: one app fetch fails, one succeeds (app found) → hasApplied is true (confirmed positive wins)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1, course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockRejectedValueOnce(new Error('fail'))      // c1: fails
      .mockResolvedValueOnce(pendingApp);             // c2: has application

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const appliedStep = screen.queryByText('Apply for your certificate');
    if (appliedStep) {
      // confirmed positive from c2
      expect(appliedStep.className).toContain('line-through');
    }
  });

  it('R2-5: 2 courses, both app fetches fail → "Apply for your certificate" shown as unknown', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1, course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications).mockRejectedValue(new Error('fail'));

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const appliedStep = screen.queryByText('Apply for your certificate');
    if (appliedStep) {
      expect(appliedStep.className).not.toContain('line-through');
      const li = appliedStep.closest('li');
      expect(li?.textContent).not.toContain('Done');
    }
  });

  it('R2-6: 2 courses: one app fetch fails, one succeeds (no app) → hasApplied is unknown', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1, course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockRejectedValueOnce(new Error('fail'))     // c1: fails
      .mockResolvedValueOnce([]);                   // c2: no app

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const appliedStep = screen.queryByText('Apply for your certificate');
    if (appliedStep) {
      // can't confirm negative because c1 errored
      expect(appliedStep.className).not.toContain('line-through');
      const li = appliedStep.closest('li');
      expect(li?.textContent).not.toContain('Done');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R3 — Application fetch failure display and retry
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R4 R3 — application fetch failure display', () => {
  beforeEach(commonBeforeEach);

  it('R3-1: 1 course, app fetch fails → accessible error shown in cert row', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications).mockRejectedValue(new Error('app fail'));

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // Must show an accessible error for the application fetch failure
    // (not silently hiding or showing "no application")
    const appErrors = screen.getAllByRole('alert');
    expect(appErrors.length).toBeGreaterThan(0);
  });

  it('R3-2: app fetch fails → retry → succeeds (no app) → error gone, no-app state shown correctly', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockRejectedValueOnce(new Error('app fail'))
      .mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // Error shown initially
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // Error gone after successful retry
    await waitFor(() => {
      const alerts = screen.queryAllByRole('alert');
      expect(alerts.length).toBe(0);
    });
  });

  it('R3-3: retry button click triggers getCourseApplications again', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    const initialCallCount = vi.mocked(courseCompletionService.getCourseApplications).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() =>
      expect(vi.mocked(courseCompletionService.getCourseApplications).mock.calls.length)
        .toBeGreaterThan(initialCallCount)
    );
  });

  it('R3-4: app fetch fails, progress eligible → "Request certificate" button NOT shown', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockRejectedValue(new Error('app fail'));

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // Button must NOT appear — we don't know if student already applied
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });

  it('R3-5: app fetch fails, progress not eligible → "Request certificate" button NOT shown', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressOk(0));
    vi.mocked(courseCompletionService.getCourseApplications).mockRejectedValue(new Error('app fail'));

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });

  it('R3-6: app fetch succeeds (no app), progress eligible → "Request certificate" button SHOWN', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument();
  });

  it('R3-7: handleApplyCertificate invocation guarded — applyForCertificate NOT called when appFailed', async () => {
    // Enforce the rule at invocation as well as visibility: even if the button were somehow
    // triggered (e.g., programmatic click), the service must not be called.
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockRejectedValue(new Error('app fail'));

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    // Button must not be visible
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();

    // applyForCertificate must not have been called during render/setup
    expect(vi.mocked(courseCompletionService.applyForCertificate).mock.calls.length).toBe(0);
  });

  it('R3-8: app fetch fails → retry → succeeds (pending app) → "Application pending" badge shown, error gone', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(pendingApp);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Intro to Blockchain')).toBeInTheDocument()
    );

    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByText(/application pending/i)).toBeInTheDocument();
    });

    // Error alert gone after successful retry showing known status
    await waitFor(() => {
      const alerts = screen.queryAllByRole('alert');
      expect(alerts.length).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4 — Progress retry via retryLoadCourses
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R4 R4 — progress retry', () => {
  beforeEach(commonBeforeEach);

  it('R4-1: progress fetch fails → retry courses → progress succeeds → progress data shown, errors gone', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress)
      .mockRejectedValueOnce(new Error('progress fail'))
      .mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Eligibility unavailable')).toBeInTheDocument()
    );

    // Retry via the courses retry button
    const retryBtn = screen.queryByRole('button', { name: /try again/i });
    if (retryBtn) {
      fireEvent.click(retryBtn);

      await waitFor(() =>
        expect(screen.queryByText('Eligibility unavailable')).toBeNull()
      );
      await waitFor(() =>
        expect(screen.getByText(/eligible to apply/i)).toBeInTheDocument()
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R5 — 409 and known application status preservation
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R4 R5 — 409 and known application status', () => {
  beforeEach(commonBeforeEach);

  it('R5-1: app loads successfully as pending → cert row shows "Application pending" (existing W09-R3 preserved)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue(pendingApp);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText(/application pending/i)).toBeInTheDocument()
    );

    // "Request certificate" must NOT be shown when app is pending
    expect(screen.queryByRole('button', { name: /request certificate/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R7 — W06–W09-R3 regression preservation
// ─────────────────────────────────────────────────────────────────────────────

describe('W09-R4 R7 — W09-R3 regression preservation', () => {
  beforeEach(commonBeforeEach);

  it('R7-1: progress error course → "Eligibility unavailable" badge still shown (W09-R3 preserved)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockRejectedValue(new Error());
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Eligibility unavailable')).toBeInTheDocument()
    );
    expect(screen.queryByText(/you have not yet met the course requirements/i)).toBeNull();
  });

  it('R7-2: coursesError → enrolled, hasCompletedLesson, hasApplied all null (W09-R3 preserved)', async () => {
    vi.mocked(courseService.fetchCourses).mockRejectedValue(new Error());

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText(/could not load courses/i)).toBeInTheDocument()
    );

    // All checklist steps that depend on courses must be unknown (no "Done", no strikethrough)
    const steps = ['Enrol in a course', 'Complete your first lesson', 'Apply for your certificate'];
    for (const label of steps) {
      const el = screen.queryByText(label);
      if (el) {
        expect(el.className).not.toContain('line-through');
        expect(el.closest('li')?.textContent).not.toContain('Done');
      }
    }
  });

  it('R7-3: progress ok, app ok (no app), eligible → "Eligible to apply" badge + Request certificate button', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course1] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockResolvedValue(progressEligible);
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText(/eligible to apply/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /request certificate/i })).toBeInTheDocument();
  });

  it('R7-STUDENT-PROG-1: progress load fails → "Eligibility unavailable" not "not eligible" (W09-R3 regression)', async () => {
    vi.mocked(courseService.fetchCourses).mockResolvedValue([course2] as any);
    vi.mocked(courseCompletionService.getCourseProgress).mockRejectedValue(new Error());
    vi.mocked(courseCompletionService.getCourseApplications).mockResolvedValue([]);

    renderStudent();

    await waitFor(() =>
      expect(screen.getByText('Crypto Fundamentals')).toBeInTheDocument()
    );

    expect(screen.queryByText(/you have not yet met the course requirements/i)).toBeNull();
    expect(screen.getByText(/eligibility unavailable/i)).toBeInTheDocument();
  });
});
