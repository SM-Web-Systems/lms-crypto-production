/**
 * CohortInsightsPanel + SponsorROIPanel — Phase 25 C4
 *
 * COHORT-FE-1: CohortInsightsPanel renders summary cards with data
 * COHORT-FE-2: SponsorROIPanel renders sponsor table with ROI metrics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CohortInsightsPanel } from '../../components/CohortInsightsPanel';
import { SponsorROIPanel } from '../../components/SponsorROIPanel';

const mockGetCohortInsights = vi.fn();
const mockGetSponsorROI = vi.fn();

vi.mock('../../services/analyticsService', () => ({
  analyticsService: {
    getDashboard: vi.fn(),
    getCourseAnalytics: vi.fn(),
    getSponsorStudents: vi.fn(),
    getQuizAnalytics: vi.fn(),
    getPaymentAnalytics: vi.fn(),
    getCohortInsights: (...args: unknown[]) => mockGetCohortInsights(...args),
    getSponsorROI: (...args: unknown[]) => mockGetSponsorROI(...args),
    exportCsv: vi.fn(),
  },
}));

const COHORT_DATA = {
  enrollmentsByMonth: [
    { month: '2026-07', count: 5 },
    { month: '2026-08', count: 12 },
  ],
  cohorts: [
    {
      cohortId: 'c1',
      cohortName: 'Alpha Cohort',
      courseName: 'Blockchain 101',
      status: 'active',
      totalMembers: 10,
      completedCount: 7,
      completionRate: 70,
      avgDaysToComplete: 14,
      nftCount: 5,
    },
  ],
  dropOff: [],
};

const ROI_DATA = {
  sponsors: [
    {
      sponsorUserId: 's1',
      sponsorName: 'Acme Corp',
      totalSpentCents: 100000,
      totalMembers: 10,
      completedCount: 7,
      costPerCompletionCents: 14286,
      nftCount: 5,
      nftRate: 50,
      cohorts: [
        {
          cohortId: 'c1',
          cohortName: 'Alpha Cohort',
          courseName: 'Blockchain 101',
          memberCount: 10,
          spentCents: 100000,
          completedCount: 7,
          nftCount: 5,
        },
      ],
    },
  ],
  totals: {
    totalSpentCents: 100000,
    totalMembers: 10,
    totalCompleted: 7,
    totalNfts: 5,
    overallCostPerCompletion: 14286,
    overallNftRate: 50,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CohortInsightsPanel (Phase 25 C4)', () => {
  it('COHORT-FE-1: renders summary cards with cohort data', async () => {
    mockGetCohortInsights.mockResolvedValueOnce(COHORT_DATA);

    render(<CohortInsightsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Cohort Insights')).toBeTruthy();
    });

    // Summary cards
    expect(screen.getByText('Total Cohorts')).toBeTruthy();
    expect(screen.getByText('Avg Completion Rate')).toBeTruthy();
    // 70.0% appears in both summary card and table row
    expect(screen.getAllByText('70.0%').length).toBeGreaterThanOrEqual(1);

    // Cohort table
    expect(screen.getByText('Alpha Cohort')).toBeTruthy();
    expect(screen.getByText('Blockchain 101')).toBeTruthy();
  });
});

describe('SponsorROIPanel (Phase 25 C4)', () => {
  it('COHORT-FE-2: renders sponsor table with ROI metrics', async () => {
    mockGetSponsorROI.mockResolvedValueOnce(ROI_DATA);

    render(<SponsorROIPanel />);

    await waitFor(() => {
      expect(screen.getByText('Sponsor ROI')).toBeTruthy();
    });

    // Summary cards
    expect(screen.getByText('Total Spent')).toBeTruthy();
    expect(screen.getAllByText('NFT Rate').length).toBeGreaterThanOrEqual(1);
    // 50.0% appears in both summary card and table row
    expect(screen.getAllByText('50.0%').length).toBeGreaterThanOrEqual(1);

    // Sponsor table
    expect(screen.getByText('Acme Corp')).toBeTruthy();
  });
});
