import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StudentCourse from '../pages/StudentCourse';

const mocks = vi.hoisted(() => ({ courses: vi.fn(), completions: vi.fn(), complete: vi.fn(), user: { id: 'ux015-user', role: 'student' } }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../services/courseService', () => ({ courseService: { fetchCourses: mocks.courses } }));
vi.mock('../services/courseCompletionService', () => ({
  courseCompletionService: { getLessonCompletions: mocks.completions, markLessonComplete: mocks.complete },
}));
vi.mock('../components/EmbeddedMaterialViewer', () => ({
  EmbeddedMaterialViewer: ({ item, isDone, onMarkDone }: { item: { id: string; title: string }; isDone?: boolean; onMarkDone?: (id: string) => void }) => (
    <div>
      <p>Viewing {item.title}</p>
      {isDone ? <p>Viewer done</p> : <button type="button" onClick={() => onMarkDone?.(item.id)}>Viewer mark as done</button>}
    </div>
  ),
}));

const course = { id: 'course', title: 'Ticks', weeks: [{ id: 'week', title: 'Week 1', sections: [{ id: 'section', title: 'Lessons', items: [
  { id: 'reading', title: 'Reading', type: 'link', url: 'https://example.com/r' },
  { id: 'notes', title: 'Notes', type: 'link', url: 'https://example.com/n' },
] }] }] };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.courses.mockResolvedValue([course]);
  mocks.complete.mockResolvedValue(undefined);
  mocks.completions.mockResolvedValue([]);
});
const openCourse = () => render(<MemoryRouter initialEntries={['/student/course?course=course&week=week']}><StudentCourse /></MemoryRouter>);

describe('UX-015 — lesson completion on web', () => {
  it('opening a material does not mark it done', async () => {
    openCourse();
    await waitFor(() => expect(screen.getByText('0 of 2 marked done')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Open material: Reading' }));
    expect(screen.getByText('Viewing Reading')).toBeInTheDocument();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('marks done from the viewer and saves it to the server', async () => {
    openCourse();
    await waitFor(() => expect(screen.getByText('0 of 2 marked done')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Open material: Reading' }));
    await userEvent.click(screen.getByRole('button', { name: 'Viewer mark as done' }));
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith('course', 'reading'));
    expect(await screen.findByText('Viewer done')).toBeInTheDocument();
  });

  it('a failed save removes the tick, says so, and can be retried', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('Network Error'));
    openCourse();
    await waitFor(() => expect(screen.getByText('0 of 2 marked done')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark as done' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn\'t save that you finished “Reading”.');
    expect(screen.getByText('0 of 2 marked done')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('1 of 2 marked done')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a done item saved on the server cannot be un-ticked, and the page says why', async () => {
    mocks.completions.mockResolvedValue([{ itemId: 'reading', completedAt: '2026-11-22', progressPct: 100, lastPositionS: null }]);
    openCourse();
    await waitFor(() => expect(screen.getByText('1 of 2 marked done')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Done (saved to your progress)' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Finished materials stay done.');
    expect(screen.getByText('1 of 2 marked done')).toBeInTheDocument();
  });

  it('a tick only on this device (never saved) can still be removed', async () => {
    localStorage.setItem('lms:courseItemDone:ux015-user:course', JSON.stringify(['notes']));
    openCourse();
    await waitFor(() => expect(mocks.completions).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('1 of 2 marked done')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Mark as not done' }));
    await waitFor(() => expect(screen.getByText('0 of 2 marked done')).toBeInTheDocument());
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
