/**
 * Deliverable 3 Batch 1 — SponsorDashboard Tab Tests
 *
 * D3B1-01  SponsorDashboard renders Impact Report tab button
 * D3B1-02  SponsorDashboard renders Billing tab button
 * D3B1-03  /sponsor/impact routes to Impact Report tab
 * D3B1-04  /sponsor/billing routes to Billing tab
 * D3B1-05  Impact Report renders loading state
 * D3B1-06  Impact Report renders cohort metrics with data
 * D3B1-07  Impact Report renders empty state
 * D3B1-08  Impact Report renders error state with retry
 * D3B1-09  Billing tab renders loading state
 * D3B1-10  Billing tab renders payment history with data
 * D3B1-11  Billing tab renders empty state
 * D3B1-12  Billing tab renders error state with retry
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ImpactReport, SponsorBilling } from '../../services/sponsorService';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: '1', name: 'Sponsor', email: 's@test.com', role: 'sponsor', walletAddress: null, walletLinkingStatus: 'none' as const },
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

const mockListCohorts = vi.fn().mockResolvedValue([]);
const mockGetSpendingReport = vi.fn().mockResolvedValue(null);
vi.mock('../../services/cohortService', () => ({
  cohortService: {
    listCohorts: (...args: unknown[]) => mockListCohorts(...args),
    getSpendingReport: (...args: unknown[]) => mockGetSpendingReport(...args),
  },
}));

const mockGetImpactReport = vi.fn();
const mockGetBilling = vi.fn();
vi.mock('../../services/sponsorService', () => ({
  sponsorService: {
    getImpactReport: (...args: unknown[]) => mockGetImpactReport(...args),
    getBilling: (...args: unknown[]) => mockGetBilling(...args),
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
};

const sampleBilling: SponsorBilling = {
  payments: [
    { id: 'p1', courseId: 'course1', amountCents: 25000, currency: 'USD', paymentMethod: 'manual', status: 'confirmed', createdAt: '2026-09-15T10:00:00Z' },
    { id: 'p2', courseId: 'course2', amountCents: 15000, currency: 'USD', paymentMethod: 'manual', status: 'pending', createdAt: '2026-10-01T10:00:00Z' },
  ],
  total: 2,
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SponsorDashboard — Batch 1 Tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetImpactReport.mockResolvedValue(sampleImpact);
    mockGetBilling.mockResolvedValue(sampleBilling);
  });

  // ─── Tab Rendering ───────────────────────────────────────────────────────

  it('D3B1-01: renders Impact Report tab button', async () => {
    renderWithRoute('/sponsor');
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /impact/i })).toBeInTheDocument();
    });
  });

  it('D3B1-02: renders Billing tab button', async () => {
    renderWithRoute('/sponsor');
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /billing/i })).toBeInTheDocument();
    });
  });

  // ─── Tab Routing ─────────────────────────────────────────────────────────

  it('D3B1-03: /sponsor/impact routes to Impact Report tab', async () => {
    renderWithRoute('/sponsor/impact');
    await waitFor(() => {
      expect(screen.getByText(/total students/i)).toBeInTheDocument();
    });
  });

  it('D3B1-04: /sponsor/billing routes to Billing tab', async () => {
    renderWithRoute('/sponsor/billing');
    await waitFor(() => {
      expect(screen.getAllByText(/payment history/i).length).toBeGreaterThan(0);
    });
  });

  // ─── Impact Report States ───────────────────────────────────────────────

  it('D3B1-05: Impact Report renders loading state', async () => {
    mockGetImpactReport.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRoute('/sponsor/impact');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('D3B1-06: Impact Report renders cohort metrics with data', async () => {
    renderWithRoute('/sponsor/impact');
    await waitFor(() => {
      expect(screen.getByText('45')).toBeInTheDocument(); // totalMembers
      expect(screen.getByText('30')).toBeInTheDocument(); // totalCompleted
      expect(screen.getByText('67%')).toBeInTheDocument(); // completionPct
      expect(screen.getByText('Acme Q3')).toBeInTheDocument();
      expect(screen.getByText('Beta Program')).toBeInTheDocument();
    });
  });

  it('D3B1-07: Impact Report renders empty state', async () => {
    mockGetImpactReport.mockResolvedValue({
      totalMembers: 0,
      totalCompleted: 0,
      totalCertificates: 0,
      completionPct: 0,
      cohorts: [],
    });
    renderWithRoute('/sponsor/impact');
    await waitFor(() => {
      expect(screen.getByText(/no cohort data/i)).toBeInTheDocument();
    });
  });

  it('D3B1-08: Impact Report renders error state with retry', async () => {
    mockGetImpactReport.mockRejectedValue(new Error('Network error'));
    renderWithRoute('/sponsor/impact');
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  // ─── Billing States ─────────────────────────────────────────────────────

  it('D3B1-09: Billing tab renders loading state', async () => {
    mockGetBilling.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRoute('/sponsor/billing');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('D3B1-10: Billing tab renders payment history with data', async () => {
    renderWithRoute('/sponsor/billing');
    await waitFor(() => {
      expect(screen.getByText('$250.00')).toBeInTheDocument(); // 25000 cents
      expect(screen.getByText('$150.00')).toBeInTheDocument(); // 15000 cents
      expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
      expect(screen.getByText(/pending/i)).toBeInTheDocument();
    });
  });

  it('D3B1-11: Billing tab renders empty state', async () => {
    mockGetBilling.mockResolvedValue({ payments: [], total: 0 });
    renderWithRoute('/sponsor/billing');
    await waitFor(() => {
      expect(screen.getByText(/no payment history/i)).toBeInTheDocument();
    });
  });

  it('D3B1-12: Billing tab renders error state with retry', async () => {
    mockGetBilling.mockRejectedValue(new Error('Server error'));
    renderWithRoute('/sponsor/billing');
    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
