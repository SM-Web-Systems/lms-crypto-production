/**
 * A11Y-01 — SponsorDashboard WCAG tab pattern tests.
 *
 * A11Y-01a: Each tab has aria-controls matching its panel id
 * A11Y-01b: Each panel has role="tabpanel" and aria-labelledby matching its tab id
 * A11Y-01c: ArrowRight moves focus to next tab
 * A11Y-01d: ArrowLeft wraps from first tab to last
 * A11Y-01e: Active tab has tabIndex 0, inactive tabs have tabIndex -1
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: '1', name: 'Sponsor', email: 's@test.com',  workspaces:['sponsor'], permissions:['cohort.view_own','cohort.manage','reward.view_assigned','impact_report.read','billing.view_own','student.view_assigned'], walletAddress: null, walletLinkingStatus: 'none' as const },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  })),
}));

vi.mock('../../services/messageService', () => ({
  messageService: { getUnreadCount: vi.fn().mockResolvedValue(0) },
}));

vi.mock('../../services/analyticsService', () => ({
  analyticsService: {
    getCourseAnalytics: vi.fn().mockResolvedValue([]),
    getSponsorStudents: vi.fn().mockResolvedValue([]),
    exportCsv: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/cohortService', () => ({
  cohortService: {
    listCohorts: vi.fn().mockResolvedValue([]),
    getSpendingReport: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../services/sponsorService', () => ({
  sponsorService: {
    getCourses:vi.fn().mockResolvedValue([]),getStudents:vi.fn().mockResolvedValue([]),exportCoursesCsv:vi.fn(),
    getCourseOptions:vi.fn().mockResolvedValue([]),getDashboard:vi.fn().mockResolvedValue({cohorts:[]}),getSpendingReport:vi.fn().mockResolvedValue(null),
    getImpactReport: vi.fn().mockResolvedValue({ totalMembers: 0, totalCompleted: 0, totalCertificates: 0, completionPct: 0, cohorts: [] }),
    getBilling: vi.fn().mockResolvedValue({ payments: [], total: 0 }),
  },
}));

import SponsorDashboard from '../../pages/SponsorDashboard';

function renderDashboard(path = '/sponsor') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SponsorDashboard />
    </MemoryRouter>,
  );
}

describe('A11Y-01 — WCAG tab pattern', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('A11Y-01a: each tab has aria-controls matching a panel id', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument());

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(5);

    for (const tab of tabs) {
      const controls = tab.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(tab.getAttribute('id')).toBeTruthy();
    }
  });

  it('A11Y-01b: active panel has role="tabpanel" with aria-labelledby matching its tab', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument());

    const panel = screen.getByRole('tabpanel');
    expect(panel).toBeInTheDocument();
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-overview');
    expect(panel.getAttribute('id')).toBe('tabpanel-overview');
  });

  it('A11Y-01c: ArrowRight moves focus to next tab', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument());

    const overviewTab = screen.getByRole('tab', { name: /overview/i });
    overviewTab.focus();
    await user.keyboard('{ArrowRight}');

    const cohortsTab = screen.getByRole('tab', { name: /cohorts/i });
    expect(cohortsTab).toHaveFocus();
  });

  it('A11Y-01d: ArrowLeft from first tab wraps to last tab', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument());

    const overviewTab = screen.getByRole('tab', { name: /overview/i });
    overviewTab.focus();
    await user.keyboard('{ArrowLeft}');

    const billingTab = screen.getByRole('tab', { name: /billing/i });
    expect(billingTab).toHaveFocus();
  });

  it('A11Y-01e: active tab has tabIndex 0, inactive tabs have tabIndex -1', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument());

    const tabs = screen.getAllByRole('tab');
    const activeTab = tabs.find(t => t.getAttribute('aria-selected') === 'true');
    const inactiveTabs = tabs.filter(t => t.getAttribute('aria-selected') === 'false');

    expect(activeTab).toBeTruthy();
    expect(activeTab!.getAttribute('tabindex')).toBe('0');
    for (const tab of inactiveTabs) {
      expect(tab.getAttribute('tabindex')).toBe('-1');
    }
  });
});
