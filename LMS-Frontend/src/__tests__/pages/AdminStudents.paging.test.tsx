/** UX-003 AC5/AC6: Student Management pages on the server; the total and search cover every student. */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../services/courseService', () => ({ courseService: { fetchCourses: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/usersService', () => ({ usersService: { getUsers: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../services/userDirectoryService', () => ({ userDirectoryService: {} }));
const getAll = vi.fn();
vi.mock('../../services/studentsService', () => ({ studentsService: { getAll: (...a: unknown[]) => getAll(...a) } }));

import { DataProvider } from '../../context/DataContext';
import AdminStudents from '../../pages/AdminStudents';

type Params = { page?: number; limit?: number; search?: string; walletStatus?: string };
const all = Array.from({ length: 27 }, (_, i) => ({
  id: `st${i + 1}`, userId: `u${i + 1}`, name: `Learner ${i + 1}`, email: `l${i + 1}@test.com`,
  enrollmentNumber: `E-${i + 1}`, department: 'Physics', semester: 1, walletLinkingStatus: 'none',
}));
function serve(p: Params = {}) {
  const limit = p.limit ?? 20;
  const page = p.page ?? 1;
  const rows = p.search ? all.filter((s) => s.name.includes(p.search!)) : all;
  return { students: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) } };
}

let location = '';
function Where() { location = useLocation().search; return null; }
const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <DataProvider><Routes><Route path="*" element={<><AdminStudents /><Where /></>} /></Routes></DataProvider>
  </MemoryRouter>,
);

describe('AdminStudents paging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockImplementation(async (p: Params) => serve(p));
  });

  it('total students equals the server total, and Next reaches row 21', async () => {
    renderAt('/admin/students');
    expect(await screen.findByText('All Students (27)')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Learner 21')).toBeInTheDocument();
    expect(getAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 20 }));
    expect(location).toContain('page=2');
  });

  it('search goes to the server and finds students past the first page', async () => {
    renderAt('/admin/students?page=2');
    await screen.findByText('Page 2 of 2');
    expect(screen.queryByText('Learner 3')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'Learner 3' } });
    expect(await screen.findByText('All Students (1)', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Learner 3')).toBeInTheDocument();
    expect(getAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'Learner 3' }));
    expect(location).toContain('search=Learner+3');
  });

  it('wallet filter goes to the server', async () => {
    renderAt('/admin/students');
    await screen.findByText('All Students (27)');
    fireEvent.change(screen.getByLabelText('Wallet'), { target: { value: 'linked' } });
    await waitFor(() => expect(getAll).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, walletStatus: 'linked' })));
    expect(location).toContain('walletStatus=linked');
  });
});
