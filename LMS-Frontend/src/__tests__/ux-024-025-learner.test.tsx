/**
 * UX-024 (named controls) and UX-025 (learner dead ends).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null, logout: vi.fn(),
  prefs: vi.fn(), courses: vi.fn(), completions: vi.fn(), myProgress: vi.fn(),
}));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: mocks.user, isAuthenticated: !!mocks.user, isLoading: false, logout: mocks.logout }) }));
vi.mock('../services/notificationService', () => ({ notificationService: { getPreferences: mocks.prefs, updatePreferences: vi.fn() } }));
vi.mock('../services/courseService', () => ({ courseService: { fetchCourses: mocks.courses, fetchCourseById: vi.fn().mockResolvedValue(null) } }));
vi.mock('../services/courseCompletionService', () => ({ courseCompletionService: {
  getLessonCompletions: mocks.completions, getMyProgress: mocks.myProgress, applyForCertificate: vi.fn(), getCourseApplications: vi.fn(),
} }));
vi.mock('../services/quizService', () => ({ quizService: { getCompletionsForUser: vi.fn().mockResolvedValue([]) } }));

import NotificationSettings from '../pages/NotificationSettings';
import StudentCourse from '../pages/StudentCourse';
import StudentProgress from '../pages/StudentProgress';
import Landing from '../pages/Landing';
import CertEligibilitySection from '../components/dashboard/CertEligibilitySection';
import { AccessDenied } from '../App';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
const progress = { userId: 'l1', courseId: 'c1', totalLessonItems: 1, completedLessonItems: 1, lessonPercentage: 100, requiredQuizzes: [],
  allRequiredQuizzesPassed: true, hasApprovedSubmission: true, meetsAllRequirements: true, canApplyForCertificate: true };
const learner = { id: 'l1', name: 'Lee', email: 'lee@example.invalid', role: 'student', workspaces: ['student'], defaultWorkspace: 'student', permissions: ['course.view'] };

beforeEach(() => { vi.clearAllMocks(); mocks.user = learner; });

describe('UX-024 named controls', () => {
  it('each notification switch is named by its topic, including the reward types', async () => {
    mocks.prefs.mockResolvedValue([{ type: 'submission_reviewed', enabled: true }, { type: 'reward_funded', enabled: false }, { type: 'reward_declined', enabled: true }]);
    render(<MemoryRouter><NotificationSettings /></MemoryRouter>);
    expect(await screen.findByRole('switch', { name: 'Submission Reviewed' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Reward funded' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Reward sent back' })).toBeInTheDocument();
  });

  it('the notification settings gear has an accessible name', () => {
    expect(read('components/NotificationBell.tsx')).toMatch(/aria-label="Notification settings"/);
  });
});

describe('UX-025 learner dead ends', () => {
  it('access denied with no workspace still offers Sign out', async () => {
    mocks.user = { ...learner, workspaces: [], defaultWorkspace: null };
    render(<MemoryRouter><AccessDenied /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.logout).toHaveBeenCalled();
  });

  it('a learner with no course gets a way forward instead of "contact your instructor"', async () => {
    mocks.courses.mockResolvedValue([]);
    mocks.completions.mockResolvedValue([]);
    render(<MemoryRouter initialEntries={['/student/course']}><StudentCourse /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'See invitations on your dashboard' })).toHaveAttribute('href', '/student');
    expect(screen.getByText(/lee@example\.invalid/)).toBeInTheDocument();
  });

  it('the landing page has a create-account call to action', () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const links = screen.getAllByRole('link', { name: /Create an account/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/sign-up');
  });

  it('"Apply for certificate" on Progress goes to that course\'s application, not the top of the dashboard', async () => {
    mocks.myProgress.mockResolvedValue([{ ...progress, courseName: 'Rust', courseCode: null, certificateStatus: 'eligible', applicationId: null, txHash: null }]);
    render(<MemoryRouter><StudentProgress /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Apply for certificate' })).toHaveAttribute('href', '/student#certificate-c1');
  });

  it('the dashboard certificate section brings the linked course into view and focus', async () => {
    const course = { id: 'c1', title: 'Rust', courseCode: null } as never;
    render(<MemoryRouter initialEntries={['/student#certificate-c1']}>
      <CertEligibilitySection userWalletAddress="G1" courses={[course]} coursesLoading={false}
        progressMap={{ c1: progress }} appStatusMap={{ c1: null }} onAppStatusChange={vi.fn()} />
    </MemoryRouter>);
    await waitFor(() => expect(document.getElementById('certificate-c1')).toHaveFocus());
  });

  it('the certificates toolbar wraps on narrow screens', () => {
    expect(read('pages/BadgeGallery.tsx')).toMatch(/<div className="flex flex-wrap items-center gap-\d[^"]*">\s*<div className="relative/);
  });

  it('message delete is visible on touch screens and only hides where hover exists', () => {
    const messages = read('pages/Messages.tsx');
    expect(messages).not.toMatch(/opacity-0 group-hover:opacity-100[^"]*"\s*aria-label="Delete message"/);
    expect(messages).toMatch(/reveal-on-hover[^"]*"\s*aria-label="Delete message"/);
    expect(read('index.css')).toMatch(/@media \(hover: hover\)[^@]*\.reveal-on-hover \{ opacity: 0; \}/);
  });
});
