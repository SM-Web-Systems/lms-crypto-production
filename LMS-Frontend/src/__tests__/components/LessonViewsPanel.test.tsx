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

  it('shows an empty state when nothing has been played or the request fails', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    render(<LessonViewsPanel />);
    expect(await screen.findByText(/no video or audio plays/i)).toBeInTheDocument();
  });
});
