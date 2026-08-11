/**
 * Tests for Phase 25 C5 — Bulk Certificate Export (ZIP).
 *
 * BULK-FE-1 — BadgeGallery renders "Download All" button when credentials exist
 * BULK-FE-2 — CohortManagement renders "Export Certificates" button when NFT members exist
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock BadgeGallery dependencies ──────────────────────────────────────────

vi.mock('../../services/courseCompletionService', () => ({
  courseCompletionService: {
    getMyCredentials: vi.fn(),
    bulkExportCredentials: vi.fn(),
    bulkExportCohort: vi.fn(),
  },
}));

vi.mock('../../services/cohortService', () => ({
  cohortService: {
    createCohort: vi.fn(),
    listCohorts: vi.fn(),
    getCohort: vi.fn(),
    addMembers: vi.fn(),
    removeMember: vi.fn(),
    bulkApply: vi.fn(),
    bulkPay: vi.fn(),
    transitionStatus: vi.fn(),
    getStatusLog: vi.fn(),
    bulkInviteToCohort: vi.fn(),
    sendPaymentReminder: vi.fn(),
  },
}));

import { courseCompletionService } from '../../services/courseCompletionService';
import { cohortService } from '../../services/cohortService';

const mockGetMyCredentials = courseCompletionService.getMyCredentials as ReturnType<typeof vi.fn>;
const mockListCohorts = cohortService.listCohorts as ReturnType<typeof vi.fn>;
const mockGetCohort = cohortService.getCohort as ReturnType<typeof vi.fn>;
const mockGetStatusLog = cohortService.getStatusLog as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BULK-FE-1: BadgeGallery "Download All" button', () => {
  it('renders Download All button when credentials exist', async () => {
    mockGetMyCredentials.mockResolvedValue([
      {
        credentialId: 'cred-1',
        walletAddress: 'GABCD',
        txHash: 'tx1',
        courseId: 'c1',
        courseTitle: 'Test Course',
        courseCode: 'TC-101',
        network: 'public',
        issuedAt: '2026-01-01',
        sorobanTokenId: 1,
        contractId: 'CONTRACT1',
      },
    ]);

    // Dynamic import to pick up mocks
    const { default: BadgeGallery } = await import('../../pages/BadgeGallery');
    render(<BadgeGallery />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-download-all')).toBeDefined();
    });

    const btn = screen.getByTestId('btn-download-all');
    expect(btn.textContent).toContain('Download All');
  });
});

describe('BULK-FE-2: CohortManagement "Export Certificates" button', () => {
  it('renders Export Certificates button when cohort has NFT members', async () => {
    mockListCohorts.mockResolvedValue([
      {
        cohortId: 'coh1',
        name: 'Test Cohort',
        courseId: 'c1',
        courseName: 'Test Course',
        selectedTier: 'free',
        status: 'active',
        memberCount: 1,
        appliedCount: 1,
        paymentStatus: null,
      },
    ]);

    mockGetCohort.mockResolvedValue({
      members: [
        {
          userId: 'u1',
          name: 'Student 1',
          email: 'student1@test.com',
          enrollmentStatus: 'enrolled',
          applicationStatus: 'minted',
          certificateStatus: 'nft',
          lessonProgress: 100,
          meetsRequirements: true,
        },
      ],
      completionStats: { totalMembers: 1, completedCount: 1, certifiedCount: 1, avgLessonProgress: 100 },
    });

    mockGetStatusLog.mockResolvedValue([]);

    const { CohortManagement } = await import('../../components/CohortManagement');
    render(<CohortManagement courses={[{ id: 'c1', title: 'Test Course', tiersEnabled: 'both' }]} />);

    // Expand the cohort detail
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Test Cohort')).toBeDefined();
    });

    // Click cohort row to expand
    await user.click(screen.getByText('Test Cohort'));

    await waitFor(() => {
      expect(screen.getByTestId('btn-export-certificates')).toBeDefined();
    });

    const btn = screen.getByTestId('btn-export-certificates');
    expect(btn.textContent).toContain('Export Certificates');
  });
});
