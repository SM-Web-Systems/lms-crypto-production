/** UX-003 AC4 (and UX-002 AC5): dashboard counts are server totals, not the rows loaded. */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { name: 'Ada Admin', permissions: ['course.grade', 'user.view_all', 'user.manage', 'system.view_audit_log'] } }) }));
const sub = (id: string, gradeStatus: string) => ({ id, status: 'pending', gradeStatus, submittedAt: '2026-11-01T10:00:00Z', studentName: 'Sam', title: id });
vi.mock('../../context/DataContext', () => ({
  useData: () => ({
    students: [], submissions: [sub('direct', 'direct'), sub('ta', 'pending_approval')],
    studentsPagination: { page: 1, limit: 20, total: 57, totalPages: 3 },
    studentsLoading: false, submissionsLoading: false, studentsError: null, submissionsError: null,
    fetchStudents: vi.fn(), fetchSubmissions: vi.fn(),
  }),
}));
const getAll = vi.fn();
vi.mock('../../services/submissionsService', () => ({ submissionsService: { getAll: (...a: unknown[]) => getAll(...a) } }));
vi.mock('../../services/analyticsService', () => ({ analyticsService: { getCourseAnalytics: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../components/AnnouncementsPanel', () => ({ AnnouncementsPanel: () => null }));
vi.mock('../../components/QuizAnalyticsPanel', () => ({ QuizAnalyticsPanel: () => null }));
vi.mock('../../components/PaymentAnalyticsPanel', () => ({ PaymentAnalyticsPanel: () => null }));
vi.mock('../../components/CohortInsightsPanel', () => ({ CohortInsightsPanel: () => null }));
vi.mock('../../components/SponsorROIPanel', () => ({ SponsorROIPanel: () => null }));
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) }));

import AdminDashboard from '../../pages/AdminDashboard';

const totals: Record<string, number> = { pending: 42, approved: 13, rejected: 6 };

describe('AdminDashboard counts', () => {
  beforeEach(() => getAll.mockImplementation(async (p?: { status?: string }) => (
    { submissions: [], pagination: { page: 1, limit: 1, total: totals[p?.status ?? ''] ?? 0, totalPages: 1 } }
  )));

  it('uses server totals', async () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    // Pending includes TA grades waiting for approval (they keep status=pending), so it is one server count.
    expect(await screen.findByText(/^42 submissions waiting for review/)).toBeInTheDocument();
    for (const status of ['pending', 'approved', 'rejected']) expect(getAll).toHaveBeenCalledWith({ status, limit: 1 });
    expect(screen.getAllByText('13').length).toBeGreaterThan(0);
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
    expect(screen.getAllByText('57').length).toBeGreaterThan(0);
    expect(screen.getAllByText('61').length).toBeGreaterThan(0);
  });
});
