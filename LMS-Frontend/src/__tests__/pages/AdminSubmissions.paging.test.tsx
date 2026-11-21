/** UX-003 AC1-AC3, AC6, AC7: submission lists page on the server; counts and search cover every row. */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { name: 'Ada Admin', permissions: ['course.grade'] } }) }));
vi.mock('../../services/courseService', () => ({
  courseService: {
    fetchCourses: vi.fn().mockResolvedValue([{ id: 'c1', title: 'Course One', courseCode: 'C1' }]),
    fetchCourseMembers: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/studentsService', () => ({
  studentsService: { getAll: vi.fn().mockResolvedValue({ students: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } }) },
}));
const getAll = vi.fn();
vi.mock('../../services/submissionsService', () => ({
  submissionsService: { getAll: (...a: unknown[]) => getAll(...a), download: vi.fn() },
}));

import { DataProvider } from '../../context/DataContext';
import AdminSubmissions from '../../pages/AdminSubmissions';
import LecturerSubmissions from '../../pages/LecturerSubmissions';

type Params = { page?: number; limit?: number; search?: string; status?: string; gradeStatus?: string; courseId?: string };
const rows = Array.from({ length: 45 }, (_, i) => ({
  id: `s${i + 1}`, studentId: 'st1', studentName: 'Sam Learner', title: `Essay ${i + 1}`, description: '',
  fileName: 'f.pdf', fileSize: 1, fileUrl: '', status: 'pending', submittedAt: '2026-11-01T10:00:00Z', courseId: 'c1',
}));
const statusTotals: Record<string, number> = { pending: 30, approved: 10, rejected: 5 };

function serve(p: Params = {}) {
  const limit = p.limit ?? 20;
  const page = p.page ?? 1;
  if (p.gradeStatus) return { submissions: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  if (limit === 1 && p.status) return { submissions: [], pagination: { page: 1, limit: 1, total: statusTotals[p.status], totalPages: statusTotals[p.status] } };
  const all = p.search ? rows.filter((r) => r.title.includes(p.search!)) : rows;
  return { submissions: all.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: all.length, totalPages: Math.ceil(all.length / limit) } };
}

let location = '';
function Where() { location = useLocation().search; return null; }

function renderAt(url: string, page: React.ReactElement = <AdminSubmissions />) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DataProvider>
        <Routes><Route path="*" element={<>{page}<Where /></>} /></Routes>
      </DataProvider>
    </MemoryRouter>,
  );
}
const listCalls = () => getAll.mock.calls.map((c) => c[0] as Params).filter((p) => !p.gradeStatus && p.limit !== 1);
const lastCall = () => listCalls()[listCalls().length - 1];

describe('AdminSubmissions paging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockImplementation(async (p: Params) => serve(p));
  });

  it('total from server, next page request, URL state', async () => {
    renderAt('/admin/submissions');
    expect(await screen.findByText('All Submissions (45)')).toBeInTheDocument();
    expect(screen.getAllByText(/^Essay \d+$/)).toHaveLength(20);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Essay 21')).toBeInTheDocument();
    expect(lastCall()).toMatchObject({ page: 2, limit: 20 });
    expect(location).toContain('page=2');
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Essay 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('page size 50 reaches all rows on fewer pages', async () => {
    renderAt('/admin/submissions?page=2');
    await screen.findByText('Page 2 of 3');
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } });
    expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument();
    expect(lastCall()).toMatchObject({ page: 1, limit: 50 });
    expect(location).toContain('limit=50');
    expect(screen.getAllByText(/^Essay \d+$/)).toHaveLength(45);
  });

  it('reads page, search, status and limit from the URL', async () => {
    renderAt('/admin/submissions?page=2&search=Essay&status=pending&limit=50');
    await waitFor(() => expect(listCalls()[0]).toMatchObject({ page: 2, limit: 50, search: 'Essay', status: 'pending' }));
    expect(screen.getByLabelText('Search submissions')).toHaveValue('Essay');
  });

  it('search and filter go to the server', async () => {
    renderAt('/admin/submissions?page=2');
    await screen.findByText('Page 2 of 3');
    const status = screen.getByLabelText('Status');
    expect(await within(status).findByRole('option', { name: 'Pending (30)' })).toBeInTheDocument();
    expect(within(status).getByRole('option', { name: 'Approved (10)' })).toBeInTheDocument();
    expect(within(status).getByRole('option', { name: 'Rejected (5)' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search submissions'), { target: { value: 'Essay 4' } });
    expect(await screen.findByText('All Submissions (7)', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(lastCall()).toMatchObject({ page: 1, search: 'Essay 4' });
    expect(location).toContain('search=Essay+4');
    // Status totals ignore the search, so they are hidden while one is active.
    expect(within(status).getByRole('option', { name: 'Pending' })).toBeInTheDocument();

    fireEvent.change(status, { target: { value: 'approved' } });
    await waitFor(() => expect(lastCall()).toMatchObject({ page: 1, status: 'approved', search: 'Essay 4' }));
    expect(location).toContain('status=approved');
  });

  it('a page past the last one moves to the last page', async () => {
    renderAt('/admin/submissions?page=9');
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
    expect(await screen.findByText('Essay 45')).toBeInTheDocument();
    expect(location).toContain('page=3');
  });

  it('pending badge on the All tab is the server count', async () => {
    renderAt('/admin/submissions');
    const tab = await screen.findByRole('button', { name: /All submissions/ });
    await waitFor(() => expect(tab).toHaveTextContent('30'));
  });

  it('shows a row skeleton while a page loads', async () => {
    renderAt('/admin/submissions');
    await screen.findByText('Page 1 of 3');
    getAll.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect((await screen.findAllByTestId('row-skeleton')).length).toBeGreaterThan(0);
  });

  it('an error shows retry and keeps the last good page', async () => {
    renderAt('/admin/submissions');
    await screen.findByText('Essay 1');
    getAll.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByText('Essay 1')).toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByText('Essay 21')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('course view sends courseId and pages within the course', async () => {
    renderAt('/admin/submissions');
    fireEvent.click(await screen.findByRole('button', { name: /C1/ }));
    await waitFor(() => expect(lastCall()).toMatchObject({ page: 1, courseId: 'c1' }));
    expect(location).toContain('courseId=c1');
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
  });
});

describe('LecturerSubmissions paging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockImplementation(async (p: Params) => serve(p));
  });

  it('pages the selected course on the server', async () => {
    renderAt('/lecturer/submissions', <LecturerSubmissions />);
    expect(await screen.findByText(/Submissions \(45\)/)).toBeInTheDocument();
    expect(listCalls()[0]).toMatchObject({ page: 1, limit: 20, courseId: 'c1' });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Essay 21')).toBeInTheDocument();
    expect(location).toContain('page=2');
  });
});
