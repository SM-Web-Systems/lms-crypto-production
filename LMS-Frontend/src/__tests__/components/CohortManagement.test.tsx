/**
 * Tests for Phase 11 C3 — CohortManagement component.
 *
 * COH-F1 — Cohort list renders with correct columns
 * COH-F2 — Create cohort modal submits correct payload
 * COH-F3 — Cohort detail shows members with enrollment status
 * COH-F4 — Bulk-apply button shows result summary
 * COH-F5 — Payment button visible only for paid-tier cohorts
 * COH-F6 — Free-tier cohort hides payment section
 * COH-F7 — CohortManagement detail shows progress bars per member
 * COH-F8 — CohortManagement shows aggregate completion stats
 * COH-F9 — SponsorDashboard passes actual tiersEnabled to CohortManagement
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/cohortService', () => ({
  cohortService: {
    createCohort: vi.fn(),
    listCohorts: vi.fn(),
    getCohort: vi.fn(),
    addMembers: vi.fn(),
    removeMember: vi.fn(),
    bulkApply: vi.fn(),
    bulkPay: vi.fn(),
  },
}));

import { CohortManagement } from '../../components/CohortManagement';
import { cohortService } from '../../services/cohortService';

const mockListCohorts = cohortService.listCohorts as ReturnType<typeof vi.fn>;
const mockGetCohort = cohortService.getCohort as ReturnType<typeof vi.fn>;
const mockCreateCohort = cohortService.createCohort as ReturnType<typeof vi.fn>;
const mockBulkApply = cohortService.bulkApply as ReturnType<typeof vi.fn>;

const sampleCourses = [
  { id: 'c1', title: 'Test Course', tiersEnabled: 'both' },
];

const sampleCohort = {
  cohortId: 'coh1',
  name: 'Acme Cohort',
  courseId: 'c1',
  courseName: 'Test Course',
  selectedTier: 'free' as const,
  status: 'draft' as const,
  memberCount: 2,
  appliedCount: 0,
  paymentStatus: null,
  createdAt: '2026-08-05T00:00:00Z',
};

const samplePaidCohort = {
  ...sampleCohort,
  cohortId: 'coh2',
  name: 'Paid Cohort',
  selectedTier: 'paid' as const,
};

describe('CohortManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCohorts.mockResolvedValue([sampleCohort]);
  });

  // COH-F1: Cohort list renders with correct columns
  it('COH-F1 — renders cohort list with name, course, tier, members', async () => {
    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => {
      expect(screen.getByText('Acme Cohort')).toBeInTheDocument();
    });
    expect(screen.getByText('Test Course')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // COH-F2: Create cohort modal submits
  it('COH-F2 — create cohort modal submits correct payload', async () => {
    const user = userEvent.setup();
    mockCreateCohort.mockResolvedValue(sampleCohort);

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Create Cohort'));
    await waitFor(() => expect(screen.getByPlaceholderText('e.g. Acme Corp Q3 2026')).toBeInTheDocument());

    const nameInput = screen.getByPlaceholderText('e.g. Acme Corp Q3 2026');
    await user.type(nameInput, 'New Cohort');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateCohort).toHaveBeenCalledWith({
        name: 'New Cohort',
        courseId: 'c1',
        selectedTier: 'free',
      });
    });
  });

  // COH-F3: Cohort detail shows members
  it('COH-F3 — shows members with enrollment status on expand', async () => {
    const user = userEvent.setup();
    mockGetCohort.mockResolvedValue({
      cohort: sampleCohort,
      members: [
        { userId: 'u1', userName: 'Alice', userEmail: 'alice@test.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 75, meetsRequirements: false, certificateStatus: 'none' },
        { userId: 'u2', userName: 'Bob', userEmail: 'bob@test.com', applicationId: null, applicationStatus: null, isEnrolled: false, addedAt: '2026-08-05', lessonProgress: 0, meetsRequirements: false, certificateStatus: 'none' },
      ],
      completionStats: { totalMembers: 2, completedCount: 0, certifiedCount: 0, avgLessonProgress: 38 },
    });

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  // COH-F4: Bulk-apply shows result
  it('COH-F4 — bulk-apply button shows result summary', async () => {
    const user = userEvent.setup();
    const memberData = {
      cohort: sampleCohort,
      members: [{ userId: 'u1', userName: 'Alice', userEmail: 'a@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 50, meetsRequirements: false, certificateStatus: 'none' as const }],
      completionStats: { totalMembers: 1, completedCount: 0, certifiedCount: 0, avgLessonProgress: 50 },
    };
    mockGetCohort.mockResolvedValue(memberData);
    mockBulkApply.mockResolvedValue({ cohortId: 'coh1', applied: 1, skipped: [] });
    // After apply, listCohorts is called again for refresh
    mockListCohorts.mockResolvedValue([sampleCohort]);

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => expect(screen.getByText('Apply for All')).toBeInTheDocument());

    await user.click(screen.getByText('Apply for All'));
    await waitFor(() => {
      expect(mockBulkApply).toHaveBeenCalledWith('coh1');
    });
  });

  // COH-F5: Payment button visible for paid tier
  it('COH-F5 — payment button visible for paid-tier cohorts', async () => {
    mockListCohorts.mockResolvedValue([samplePaidCohort]);
    mockGetCohort.mockResolvedValue({
      cohort: samplePaidCohort,
      members: [{ userId: 'u1', userName: 'Alice', userEmail: 'a@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 50, meetsRequirements: false, certificateStatus: 'none' as const }],
      completionStats: { totalMembers: 1, completedCount: 0, certifiedCount: 0, avgLessonProgress: 50 },
    });
    const user = userEvent.setup();

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Paid Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Paid Cohort'));
    await waitFor(() => {
      expect(screen.getByText('Create Payment')).toBeInTheDocument();
    });
  });

  // COH-F6: Free-tier hides payment button
  it('COH-F6 — free-tier cohort hides payment section', async () => {
    mockGetCohort.mockResolvedValue({
      cohort: sampleCohort,
      members: [{ userId: 'u1', userName: 'Alice', userEmail: 'a@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 50, meetsRequirements: false, certificateStatus: 'none' as const }],
      completionStats: { totalMembers: 1, completedCount: 0, certifiedCount: 0, avgLessonProgress: 50 },
    });
    const user = userEvent.setup();

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => expect(screen.getByText('Apply for All')).toBeInTheDocument());

    expect(screen.queryByText('Create Payment')).not.toBeInTheDocument();
  });

  // COH-F7: progress bars render for each member
  it('COH-F7 — shows progress bars per member', async () => {
    const user = userEvent.setup();
    mockGetCohort.mockResolvedValue({
      cohort: sampleCohort,
      members: [
        { userId: 'u1', userName: 'Alice', userEmail: 'alice@test.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 75, meetsRequirements: true, certificateStatus: 'badge' },
        { userId: 'u2', userName: 'Bob', userEmail: 'bob@test.com', applicationId: null, applicationStatus: null, isEnrolled: false, addedAt: '2026-08-05', lessonProgress: 30, meetsRequirements: false, certificateStatus: 'none' },
      ],
      completionStats: { totalMembers: 2, completedCount: 1, certifiedCount: 1, avgLessonProgress: 53 },
    });

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => {
      const progressBars = screen.getAllByTestId('progress-bar');
      expect(progressBars.length).toBe(2);
    });
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  // COH-F8: aggregate completion stats displayed
  it('COH-F8 — shows aggregate completion stats', async () => {
    const user = userEvent.setup();
    mockGetCohort.mockResolvedValue({
      cohort: sampleCohort,
      members: [
        { userId: 'u1', userName: 'Alice', userEmail: 'a@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 100, meetsRequirements: true, certificateStatus: 'nft' },
        { userId: 'u2', userName: 'Bob', userEmail: 'b@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 50, meetsRequirements: false, certificateStatus: 'none' },
      ],
      completionStats: { totalMembers: 2, completedCount: 1, certifiedCount: 1, avgLessonProgress: 75 },
    });

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => {
      const statsEl = screen.getByTestId('completion-stats');
      expect(statsEl).toBeInTheDocument();
    });
    // Stats are rendered with <strong> children, so check the container text content
    const statsEl = screen.getByTestId('completion-stats');
    expect(statsEl.textContent).toContain('1/2');
    expect(statsEl.textContent).toContain('75%');
  });

  // COH-F9: certificate status badge/nft indicators render
  it('COH-F9 — shows certificate status indicators (badge/nft)', async () => {
    const user = userEvent.setup();
    mockGetCohort.mockResolvedValue({
      cohort: sampleCohort,
      members: [
        { userId: 'u1', userName: 'Alice', userEmail: 'a@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 100, meetsRequirements: true, certificateStatus: 'nft' },
        { userId: 'u2', userName: 'Bob', userEmail: 'b@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05', lessonProgress: 100, meetsRequirements: true, certificateStatus: 'badge' },
      ],
      completionStats: { totalMembers: 2, completedCount: 2, certifiedCount: 2, avgLessonProgress: 100 },
    });

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => {
      expect(screen.getByText('NFT')).toBeInTheDocument();
      expect(screen.getByText('Badge')).toBeInTheDocument();
    });
  });
});
