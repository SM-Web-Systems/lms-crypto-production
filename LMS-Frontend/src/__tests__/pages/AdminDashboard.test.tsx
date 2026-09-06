/**
 * BUILD-FE-5: Admin dashboard renders system info section
 * BUILD-FE-6: Build SHA displays validated value
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock context providers
vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Admin', role: 'admin' } }),
}));

vi.mock('../../context/DataContext', () => ({
  useData: () => ({
    students: [],
    submissions: [],
    studentsLoading: false,
    submissionsLoading: false,
    studentsError: null,
    submissionsError: null,
    fetchStudents: vi.fn(),
    fetchSubmissions: vi.fn(),
  }),
}));

vi.mock('../../services/analyticsService', () => ({
  analyticsService: {
    getCourseAnalytics: vi.fn().mockResolvedValue([]),
    getQuizAnalytics: vi.fn().mockResolvedValue([]),
    getPaymentAnalytics: vi.fn().mockResolvedValue({ summary: {}, byCourse: [], byMethod: [], byMonth: [] }),
    getSponsorROI: vi.fn().mockResolvedValue({ courses: [] }),
    getCohortInsights: vi.fn().mockResolvedValue({ cohorts: [] }),
  },
}));

// Mock heavy child components to avoid their own service dependencies
vi.mock('../../components/AnnouncementsPanel', () => ({ AnnouncementsPanel: () => null }));
vi.mock('../../components/QuizAnalyticsPanel', () => ({ QuizAnalyticsPanel: () => null }));
vi.mock('../../components/PricingManagement', () => ({ PricingManagement: () => null }));
vi.mock('../../components/RbacAdminPanel', () => ({ RbacAdminPanel: () => null }));
vi.mock('../../components/PaymentAnalyticsPanel', () => ({ PaymentAnalyticsPanel: () => null }));
vi.mock('../../components/TenantAdminPanel', () => ({ TenantAdminPanel: () => null }));
vi.mock('../../components/EmailTemplatePanel', () => ({ EmailTemplatePanel: () => null }));
vi.mock('../../components/BroadcastPanel', () => ({ BroadcastPanel: () => null }));
vi.mock('../../components/CohortInsightsPanel', () => ({ CohortInsightsPanel: () => null }));
vi.mock('../../components/SponsorROIPanel', () => ({ SponsorROIPanel: () => null }));
vi.mock('../../components/MessageAuditPanel', () => ({ MessageAuditPanel: () => null }));

// Mock fetch for health endpoint
const mockFetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ status: 'ok', buildSha: 'abc123f' }),
});
vi.stubGlobal('fetch', mockFetch);

import AdminDashboard from '../../pages/AdminDashboard';

describe('AdminDashboard — system info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ status: 'ok', buildSha: 'abc123f' }),
    });
  });

  it('BUILD-FE-5: renders system info section with build SHAs', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>,
    );

    const sysInfo = screen.getByTestId('system-info');
    expect(sysInfo).toBeInTheDocument();

    await waitFor(() => {
      expect(sysInfo.textContent).toContain('API:');
      expect(sysInfo.textContent).toContain('Frontend:');
    });
  });

  it('BUILD-FE-6: displays validated API SHA from health endpoint', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const sysInfo = screen.getByTestId('system-info');
      expect(sysInfo.textContent).toContain('abc123f');
    });
  });
});
