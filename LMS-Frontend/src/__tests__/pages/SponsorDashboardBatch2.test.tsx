/**
 * Deliverable 3 Batch 2 — SponsorDashboard Enhancement Tests
 *
 * D3B2-FE-01  Date filter controls render on Impact Report tab
 * D3B2-FE-02  Date filter passes params to getImpactReport
 * D3B2-FE-03  Clear filter resets to all-time data
 * D3B2-FE-04  Invalid date range shows validation message
 * D3B2-FE-05  Date filter controls render on Billing tab
 * D3B2-FE-06  Date filter passes params to getBilling
 * D3B2-FE-07  Drop-off analysis table renders with data
 * D3B2-FE-08  Drop-off analysis shows empty state when no data
 * D3B2-FE-09  CSV export button calls service with format=csv
 * D3B2-FE-10  Tab buttons have accessible aria-labels
 * D3B2-FE-11  Expandable rows have aria-expanded attribute
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ImpactReport, SponsorBilling } from '../../services/sponsorService';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: '1', name: 'Sponsor', email: 's@test.com', role: 'student', workspaces:['sponsor'], permissions:['cohort.view_own','cohort.manage','reward.view_assigned','impact_report.read','billing.view_own','student.view_assigned'], walletAddress: null, walletLinkingStatus: 'none' as const },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  })),
}));

vi.mock('../../services/messageService', () => ({
  messageService: { getUnreadCount: vi.fn().mockResolvedValue(0) },
}));

const mockGetCourseAnalytics = vi.fn().mockResolvedValue([]);
const mockGetSponsorStudents = vi.fn().mockResolvedValue([]);
const mockExportCsv = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/analyticsService', () => ({
  analyticsService: {
    getCourseAnalytics: (...args: unknown[]) => mockGetCourseAnalytics(...args),
    getSponsorStudents: (...args: unknown[]) => mockGetSponsorStudents(...args),
    exportCsv: (...args: unknown[]) => mockExportCsv(...args),
  },
}));

const mockGetSpendingReport = vi.fn().mockResolvedValue(null);
vi.mock('../../services/cohortService', () => ({
  cohortService: {
    listCohorts: vi.fn().mockResolvedValue([]),
    getSpendingReport: (...args: unknown[]) => mockGetSpendingReport(...args),
  },
}));

const mockGetImpactReport = vi.fn();
const mockGetBilling = vi.fn();
const mockExportImpactCsv = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/sponsorService', () => ({
  sponsorService: {
    getCourses:(...args:unknown[])=>mockGetCourseAnalytics(...args),getStudents:(...args:unknown[])=>mockGetSponsorStudents(...args),exportCoursesCsv:(...args:unknown[])=>mockExportCsv(...args),
    getCourseOptions:async()=> (await mockGetCourseAnalytics()).map((c:{courseId:string;courseName:string;tiersEnabled?:string})=>({id:c.courseId,title:c.courseName,tiersEnabled:c.tiersEnabled??'both'})),
    getDashboard:vi.fn().mockResolvedValue({cohorts:[]}),getSpendingReport:(...args:unknown[])=>mockGetSpendingReport(...args),
    getImpactReport: (...args: unknown[]) => mockGetImpactReport(...args),
    getBilling: (...args: unknown[]) => mockGetBilling(...args),
    exportImpactCsv: (...args: unknown[]) => mockExportImpactCsv(...args),
  },
}));

import SponsorDashboard from '../../pages/SponsorDashboard';

function renderWithRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SponsorDashboard />
    </MemoryRouter>,
  );
}

// ─── Test Data ─────────────────────────────────────────────────────────────

const sampleImpact: ImpactReport = {
  totalMembers: 45,
  totalCompleted: 30,
  totalCertificates: 25,
  completionPct: 67,
  cohorts: [
    { cohortId: 'c1', cohortName: 'Acme Q3', memberCount: 25, completedCount: 18, certificateCount: 15 },
    { cohortId: 'c2', cohortName: 'Beta Program', memberCount: 20, completedCount: 12, certificateCount: 10 },
  ],
  dropOff: [
    { courseId: 'course1', courseName: 'Blockchain 101', itemId: 'lesson-3', sectionId: 'sec-1', completions: 5, totalMembers: 25, completionRate: 20 },
    { courseId: 'course1', courseName: 'Blockchain 101', itemId: 'lesson-5', sectionId: 'sec-2', completions: 8, totalMembers: 25, completionRate: 32 },
  ],
};

const sampleBilling: SponsorBilling = {
  payments: [
    { id: 'p1', courseId: 'course1', amountCents: 25000, currency: 'USD', paymentMethod: 'manual', status: 'confirmed', createdAt: '2026-09-15T10:00:00Z' },
    { id: 'p2', courseId: 'course2', amountCents: 15000, currency: 'USD', paymentMethod: 'manual', status: 'pending', createdAt: '2026-10-01T10:00:00Z' },
  ],
  total: 2,
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SponsorDashboard — Batch 2 Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetImpactReport.mockResolvedValue(sampleImpact);
    mockGetBilling.mockResolvedValue(sampleBilling);
  });

  // ─── Date Filters on Impact Report ───────────────────────────────────

  it('D3B2-FE-01: date filter controls render on Impact Report tab', async () => {
    renderWithRoute('/sponsor/impact');
    await waitFor(() => {
      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
    });
  });

  it('D3B2-FE-02: date filter passes params to getImpactReport', async () => {
    const user = userEvent.setup();
    renderWithRoute('/sponsor/impact');

    await waitFor(() => {
      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    });

    const fromInput = screen.getByLabelText(/from/i);
    const toInput = screen.getByLabelText(/to/i);

    await user.clear(fromInput);
    await user.type(fromInput, '2026-01-01');
    await user.clear(toInput);
    await user.type(toInput, '2026-06-30');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(() => {
      expect(mockGetImpactReport).toHaveBeenCalledWith({ from: '2026-01-01', to: '2026-06-30' });
    });
  });

  it('D3B2-FE-03: clear filter resets to all-time data', async () => {
    const user = userEvent.setup();
    renderWithRoute('/sponsor/impact');

    await waitFor(() => {
      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    });

    // Set dates first
    const fromInput = screen.getByLabelText(/from/i);
    await user.clear(fromInput);
    await user.type(fromInput, '2026-01-01');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(() => {
      expect(mockGetImpactReport).toHaveBeenCalledTimes(2); // initial + apply
    });

    // Click clear
    await user.click(screen.getByRole('button', { name: /clear/i }));

    await waitFor(() => {
      // Should call with no date params
      const lastCall = mockGetImpactReport.mock.calls[mockGetImpactReport.mock.calls.length - 1];
      expect(lastCall[0]).toBeUndefined();
    });
  });

  it('D3B2-FE-04: invalid date range shows validation message', async () => {
    const user = userEvent.setup();
    renderWithRoute('/sponsor/impact');

    await waitFor(() => {
      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    });

    // Set "from" after "to"
    const fromInput = screen.getByLabelText(/from/i);
    const toInput = screen.getByLabelText(/to/i);
    await user.clear(fromInput);
    await user.type(fromInput, '2026-12-01');
    await user.clear(toInput);
    await user.type(toInput, '2026-01-01');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(() => {
      expect(screen.getByText(/from.*must be before.*to/i)).toBeInTheDocument();
    });
  });

  // ─── Date Filters on Billing ─────────────────────────────────────────

  it('D3B2-FE-05: date filter controls render on Billing tab', async () => {
    renderWithRoute('/sponsor/billing');
    await waitFor(() => {
      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
    });
  });

  it('D3B2-FE-06: date filter passes params to getBilling', async () => {
    const user = userEvent.setup();
    renderWithRoute('/sponsor/billing');

    await waitFor(() => {
      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    });

    const fromInput = screen.getByLabelText(/from/i);
    const toInput = screen.getByLabelText(/to/i);

    await user.clear(fromInput);
    await user.type(fromInput, '2026-03-01');
    await user.clear(toInput);
    await user.type(toInput, '2026-03-31');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    await waitFor(() => {
      expect(mockGetBilling).toHaveBeenCalledWith({ from: '2026-03-01', to: '2026-03-31' });
    });
  });

  // ─── Drop-off Analysis ───────────────────────────────────────────────

  it('D3B2-FE-07: drop-off analysis table renders with data', async () => {
    renderWithRoute('/sponsor/impact');
    await waitFor(() => {
      expect(screen.getByText(/drop-off analysis/i)).toBeInTheDocument();
      expect(screen.getAllByText('Blockchain 101').length).toBeGreaterThan(0);
      expect(screen.getByText('lesson-3')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
    });
  });

  it('D3B2-FE-08: drop-off shows empty state when no data', async () => {
    mockGetImpactReport.mockResolvedValue({
      ...sampleImpact,
      dropOff: [],
    });
    renderWithRoute('/sponsor/impact');
    await waitFor(() => {
      expect(screen.getByText(/no drop-off data/i)).toBeInTheDocument();
    });
  });

  // ─── CSV Export ──────────────────────────────────────────────────────

  it('D3B2-FE-09: CSV export button calls service', async () => {
    const user = userEvent.setup();
    renderWithRoute('/sponsor/impact');

    await waitFor(() => {
      expect(screen.getByText('45')).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /export.*impact/i });
    await user.click(exportBtn);

    expect(mockExportImpactCsv).toHaveBeenCalled();
  });

  // ─── Accessibility ──────────────────────────────────────────────────

  it('D3B2-FE-10: tab buttons have accessible aria-labels', async () => {
    renderWithRoute('/sponsor');
    await waitFor(() => {
      const impactTab = screen.getByRole('tab', { name: /impact report/i });
      const billingTab = screen.getByRole('tab', { name: /billing/i });
      expect(impactTab).toHaveAttribute('aria-label');
      expect(billingTab).toHaveAttribute('aria-label');
    });
  });

  it('D3B2-FE-11: expandable course rows have aria-expanded', async () => {
    mockGetCourseAnalytics.mockResolvedValue([
      { courseId: 'c1', courseName: 'Test Course', courseCode: 'TC-1', sponsorLabel: 'Sponsor', enrollmentsCount: 10, walletsLinkedCount: 5, nftsIssuedCount: 3 },
    ]);
    mockGetSpendingReport.mockResolvedValue(null);
    renderWithRoute('/sponsor');
    await waitFor(() => {
      expect(screen.getByText('Test Course')).toBeInTheDocument();
    });
    const row = screen.getByRole('button', { name: /test course/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });
});
