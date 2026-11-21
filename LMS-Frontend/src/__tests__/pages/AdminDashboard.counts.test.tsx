/** UX-002 AC5: the "waiting for review" nudge includes TA grades waiting for approval. */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { name: 'Ada Admin', permissions: ['course.grade', 'user.view_all', 'system.view_audit_log'] } }) }));
const sub = (id: string, gradeStatus: string) => ({ id, status: 'pending', gradeStatus, submittedAt: '2026-11-01T10:00:00Z', studentName: 'Sam', title: id });
vi.mock('../../context/DataContext', () => ({
  useData: () => ({
    students: [], submissions: [sub('direct', 'direct'), sub('ta', 'pending_approval')],
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

describe('AdminDashboard needs-review count', () => {
  beforeEach(() => getAll.mockResolvedValue({ submissions: [], pagination: { page: 1, limit: 1, total: 3, totalPages: 3 } }));

  it('count includes pending TA grades', async () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    // 1 pending direct submission + 3 TA grades from the server total; the loaded TA row is not counted twice.
    expect(await screen.findByText(/^4 submissions waiting for review/)).toBeInTheDocument();
    expect(getAll).toHaveBeenCalledWith({ gradeStatus: 'pending_approval', limit: 1 });
  });
});
