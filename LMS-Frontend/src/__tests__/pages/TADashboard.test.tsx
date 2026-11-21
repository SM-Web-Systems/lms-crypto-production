/** UX-002 AC3/AC4: the TA sees who submitted, can download the file, and sees send-back notes. */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { name: 'Tom Assistant' } }) }));

const getCourses = vi.fn();
const getCourseSubmissions = vi.fn();
vi.mock('../../services/taService', () => ({
  taService: {
    getCourses: (...a: unknown[]) => getCourses(...a),
    getCourseSubmissions: (...a: unknown[]) => getCourseSubmissions(...a),
    gradeSubmission: vi.fn(),
  },
}));
const download = vi.fn();
vi.mock('../../services/submissionsService', () => ({
  submissionsService: { download: (...a: unknown[]) => download(...a) },
}));

import TADashboard from '../../pages/TADashboard';

const base = { title: 'Essay 1', student_id: 'st1', status: 'pending', submitted_at: '2026-11-01T10:00:00Z', file_name: 'essay.pdf' };

describe('TADashboard grade queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCourses.mockResolvedValue([{ id: 'c1', title: 'Course One', course_code: 'C1', assigned_at: '' }]);
    getCourseSubmissions.mockResolvedValue([
      { ...base, id: 's1', student_name: 'Sam Learner', grade_status: 'direct' },
      { ...base, id: 's2', student_name: 'Pat Learner', grade_status: 'sent_back', review_note: 'Check the rubric', ta_feedback: 'Good' },
    ]);
    download.mockResolvedValue(undefined);
  });

  async function openCourse() {
    render(<TADashboard />);
    fireEvent.click(await screen.findByText('Course One'));
    await screen.findByText('Sam Learner');
  }

  it('shows learner name and Download', async () => {
    await openCourse();
    expect(screen.getByText('Pat Learner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download essay.pdf from Sam Learner' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith('s1'));
  });

  it('shows a sent-back row with the lecturer note and lets the TA grade again', async () => {
    await openCourse();
    expect(screen.getByText('Sent back')).toBeInTheDocument();
    expect(screen.getByText(/Check the rubric/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Grade' })).toHaveLength(2);
  });
});
