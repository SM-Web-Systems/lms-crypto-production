/** UX-002 AC1/AC2/AC3/AC6: lecturers and admins approve or send back TA grades. */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let permissions: string[] = [];
vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { name: 'Lena Lecturer', permissions } }) }));

const fetchSubmissions = vi.fn();
vi.mock('../../context/DataContext', () => ({
  useData: () => ({
    submissions: [], submissionsLoading: false, submissionsError: null,
    fetchSubmissions, reviewSubmission: vi.fn(), deleteSubmission: vi.fn(), downloadSubmission: vi.fn(),
  }),
}));
vi.mock('../../services/courseService', () => ({
  courseService: {
    fetchCourses: vi.fn().mockResolvedValue([{ id: 'c1', title: 'Course One', courseCode: 'C1' }]),
    fetchCourseMembers: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/studentsService', () => ({ studentsService: { getAll: vi.fn().mockResolvedValue({ students: [] }) } }));

const getAll = vi.fn();
vi.mock('../../services/submissionsService', () => ({
  submissionsService: { getAll: (...a: unknown[]) => getAll(...a), download: vi.fn() },
}));
const approveGrade = vi.fn();
const sendBackGrade = vi.fn();
vi.mock('../../services/taService', () => ({
  taService: {
    approveGrade: (...a: unknown[]) => approveGrade(...a),
    sendBackGrade: (...a: unknown[]) => sendBackGrade(...a),
  },
}));

import AdminSubmissions from '../../pages/AdminSubmissions';
import LecturerSubmissions from '../../pages/LecturerSubmissions';

const pending = {
  id: 's1', studentId: 'st1', studentName: 'Sam Learner', title: 'Essay 1', description: 'd',
  fileName: 'essay.pdf', fileSize: 10, fileUrl: '', status: 'pending', submittedAt: '2026-11-01T10:00:00Z',
  gradeStatus: 'pending_approval', gradedByName: 'Tom Assistant', proposedStatus: 'approved', taFeedback: 'Clear argument',
};
const page = (submissions: unknown[]) => ({ submissions, pagination: { page: 1, limit: 100, total: submissions.length, totalPages: 1 } });

describe('TA grades to approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['course.grade'];
    getAll.mockResolvedValue(page([pending]));
    approveGrade.mockResolvedValue(undefined);
    sendBackGrade.mockResolvedValue(undefined);
  });

  async function openTab() {
    render(<AdminSubmissions />);
    fireEvent.click(await screen.findByRole('button', { name: /TA grades to approve \(1\)/ }));
    return screen.findByTestId('ta-grade-s1');
  }

  it('lists pending TA grades', async () => {
    const row = within(await openTab());
    expect(getAll).toHaveBeenCalledWith({ gradeStatus: 'pending_approval', limit: 100 });
    for (const text of ['Sam Learner', 'Essay 1', 'Tom Assistant', 'Clear argument']) expect(row.getByText(text, { exact: false })).toBeInTheDocument();
    expect(row.getByText(/Approve/, { selector: 'p, span' })).toBeInTheDocument();
  });

  it('hidden without course.grade', async () => {
    permissions = [];
    render(<AdminSubmissions />);
    await screen.findByText('All submissions');
    expect(screen.queryByRole('button', { name: /TA grades to approve/ })).not.toBeInTheDocument();
    expect(getAll).not.toHaveBeenCalled();
  });

  it('approve calls endpoint once', async () => {
    const row = within(await openTab());
    getAll.mockResolvedValue(page([]));
    fireEvent.click(row.getByRole('button', { name: 'Approve grade' }));
    await waitFor(() => expect(screen.queryByTestId('ta-grade-s1')).not.toBeInTheDocument());
    expect(approveGrade).toHaveBeenCalledTimes(1);
    expect(approveGrade).toHaveBeenCalledWith('s1');
    expect(fetchSubmissions).toHaveBeenCalled();
  });

  it('send back requires note', async () => {
    const row = within(await openTab());
    fireEvent.click(row.getByRole('button', { name: 'Send back' }));
    fireEvent.click(row.getByRole('button', { name: 'Send back to TA' }));
    expect(await row.findByRole('alert')).toHaveTextContent('Add a note for the TA');
    expect(sendBackGrade).not.toHaveBeenCalled();
    fireEvent.change(row.getByLabelText('Note for the TA'), { target: { value: 'Too lenient' } });
    fireEvent.click(row.getByRole('button', { name: 'Send back to TA' }));
    await waitFor(() => expect(sendBackGrade).toHaveBeenCalledWith('s1', 'Too lenient'));
  });

  it('lecturers get the same tab', async () => {
    render(<LecturerSubmissions />);
    fireEvent.click(await screen.findByRole('button', { name: /TA grades to approve \(1\)/ }));
    expect(await screen.findByTestId('ta-grade-s1')).toBeInTheDocument();
  });
});
