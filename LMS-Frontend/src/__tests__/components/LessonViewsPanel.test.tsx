import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ get: vi.fn(), download: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: mocks.get } }));
vi.mock('../../services/download', () => ({ downloadWithSession: mocks.download }));
import { LessonViewsPanel } from '../../components/LessonViewsPanel';

describe('LessonViewsPanel', () => {
  it('lists lesson plays and exports the CSV with the session', async () => {
    mocks.get.mockResolvedValue({ data: { success: true, data: [{
      courseId: 'c', courseTitle: 'Stellar Vibe Coding', itemId: 'v', itemTitle: 'Intro video', itemType: 'video',
      plays: 12, learners: 9, completions: 5, averagePercentWatched: 64,
      youtubeEmbedPlays: 10, youtubeAppOpens: 3, directFilePlays: 2, offlineFilePlays: 0,
    }] } });
    mocks.download.mockResolvedValue(undefined);
    render(<LessonViewsPanel />);
    expect(await screen.findByText('Intro video')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith('/analytics/media', 'lesson-media-views.csv', { format: 'csv' }));
  });

  it('reads the server shape { data: { lessons } } without crashing (prod: "t.slice is not a function")', async () => {
    mocks.get.mockResolvedValue({ data: { success: true, data: { lessons: [{
      courseId: 'c', courseTitle: 'Stellar Vibe Coding', itemId: 'a', itemTitle: 'Audio lesson', itemType: 'audio',
      plays: 2, learners: 2, completions: 1, averagePercentWatched: 50,
      youtubeEmbedPlays: 0, youtubeAppOpens: 0, directFilePlays: 2, offlineFilePlays: 0,
    }] } } });
    render(<LessonViewsPanel />);
    expect(await screen.findByText('Audio lesson')).toBeInTheDocument();
  });

  it('shows an empty state for { lessons: [] } and for an unexpected body', async () => {
    mocks.get.mockResolvedValueOnce({ data: { success: true, data: { lessons: [] } } });
    const first = render(<LessonViewsPanel />);
    expect(await screen.findByText(/no video or audio plays/i)).toBeInTheDocument();
    first.unmount();
    mocks.get.mockResolvedValueOnce({ data: { success: true, data: { something: 'else' } } });
    render(<LessonViewsPanel />);
    expect(await screen.findByText(/no video or audio plays/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing has been played or the request fails', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    render(<LessonViewsPanel />);
    expect(await screen.findByText(/no video or audio plays/i)).toBeInTheDocument();
  });
});
