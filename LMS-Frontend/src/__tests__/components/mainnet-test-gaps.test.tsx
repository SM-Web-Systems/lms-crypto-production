import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CourseApprovalPanel from '../../components/CourseApprovalPanel';
import CertificateTierPanel from '../../components/CertificateTierPanel';
import AdminQuizzes from '../../pages/AdminQuizzes';
import { canAccessPath } from '../../utils/authorization';
import type { User } from '../../types/api';

const mocks = vi.hoisted(() => ({
  submit: vi.fn(), approve: vi.fn(), reject: vi.fn(), getTiers: vi.fn(), setTiers: vi.fn(), fetchCourses: vi.fn(),
  quizzes: vi.fn(), save: vi.fn(),
  permissions: [] as string[],
}));
vi.mock('../../services/courseService', () => ({ courseService: {
  submitForApproval: mocks.submit, approveCourse: mocks.approve, rejectCourse: mocks.reject,
  getCertificateTiers: mocks.getTiers, setCertificateTiers: mocks.setTiers, fetchCourses: mocks.fetchCourses,
} }));
vi.mock('../../services/quizService', () => ({ quizService: { getAll: mocks.quizzes, save: mocks.save, generateId: () => 'new-id' } }));
vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u', permissions: mocks.permissions } }) }));

const LECTURER = ['course.manage', 'course.create', 'quiz.manage', 'quiz.view', 'course.view'];
const ADMIN = [...LECTURER, 'course.approve', 'course.delete'];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.permissions = LECTURER;
  mocks.getTiers.mockResolvedValue('both');
});

describe('course approval buttons (gap 1)', () => {
  it('lecturer sees Submit for approval on a draft, and no Approve', async () => {
    const onChanged = vi.fn();
    mocks.submit.mockResolvedValue(undefined);
    render(<CourseApprovalPanel courseId="c1" status="draft" onChanged={onChanged} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(mocks.submit).toHaveBeenCalledWith('c1');
    expect(await screen.findByRole('status')).toHaveTextContent('Submitted for approval.');
    expect(onChanged).toHaveBeenCalled();
  });

  it('lecturer sees no buttons while the course is waiting', () => {
    render(<CourseApprovalPanel courseId="c1" status="submitted" onChanged={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
  });

  it('admin approves or sends back a submitted course with a note', async () => {
    mocks.permissions = ADMIN;
    mocks.approve.mockResolvedValue(undefined);
    mocks.reject.mockResolvedValue(undefined);
    const { rerender } = render(<CourseApprovalPanel courseId="c1" status="submitted" onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mocks.approve).toHaveBeenCalledWith('c1');
    rerender(<CourseApprovalPanel courseId="c2" status="submitted" onChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Note to the lecturer/), 'Add a quiz');
    await userEvent.click(screen.getByRole('button', { name: 'Send back' }));
    expect(mocks.reject).toHaveBeenCalledWith('c2', 'Add a quiz');
  });
});

describe('certificate tier (gap 3)', () => {
  it('lecturer chooses Free only on a draft', async () => {
    mocks.setTiers.mockResolvedValue('free_only');
    render(<CertificateTierPanel courseId="c1" status="draft" />);
    await waitFor(() => expect(mocks.getTiers).toHaveBeenCalledWith('c1'));
    await userEvent.click(screen.getByLabelText(/Free certificate only/));
    await userEvent.click(screen.getByRole('button', { name: 'Save certificate tier' }));
    expect(mocks.setTiers).toHaveBeenCalledWith('c1', 'free_only');
    expect(await screen.findByRole('status')).toHaveTextContent('Certificate tier saved.');
  });

  it('is locked for the lecturer once submitted', () => {
    render(<CertificateTierPanel courseId="c1" status="submitted" />);
    expect(screen.getByText(/locked once the course is submitted/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save certificate tier' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Free certificate only/)).toBeDisabled();
  });
});

describe('lecturer quizzes page (gap 2)', () => {
  it('opens for a lecturer with quiz.manage', () => {
    const lecturer = { workspaces: ['lecturer'], permissions: LECTURER } as unknown as User;
    expect(canAccessPath(lecturer, '/lecturer/quizzes')).toBe(true);
    expect(canAccessPath({ workspaces: ['lecturer'], permissions: ['course.manage'] } as unknown as User, '/lecturer/quizzes')).toBe(false);
    expect(canAccessPath({ workspaces: ['sponsor'], permissions: LECTURER } as unknown as User, '/lecturer/quizzes')).toBe(false);
  });

  it("lists only the lecturer's own courses and quizzes and requires a course", async () => {
    mocks.fetchCourses.mockResolvedValue([{ id: 'mine', title: 'My course' }]);
    mocks.quizzes.mockResolvedValue([
      { id: 'q1', title: 'My quiz', courseId: 'mine', questions: [] },
      { id: 'q2', title: 'Someone else quiz', courseId: 'theirs', questions: [] },
    ]);
    render(<AdminQuizzes />);
    expect(await screen.findByText('My quiz')).toBeInTheDocument();
    expect(screen.queryByText('Someone else quiz')).not.toBeInTheDocument();
    expect(mocks.fetchCourses).toHaveBeenCalledWith({ access: 'manage' });

    await userEvent.click(screen.getByRole('button', { name: /Create quiz/ }));
    expect(screen.getByLabelText('Course')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '— Choose a course —' })).toBeInTheDocument();
  });
});
