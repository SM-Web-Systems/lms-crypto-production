import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/notificationService', () => ({
  notificationService: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import NotificationSettings from '../../pages/NotificationSettings';
import { notificationService } from '../../services/notificationService';

const mockGetPrefs = notificationService.getPreferences as ReturnType<typeof vi.fn>;
const mockUpdatePrefs = notificationService.updatePreferences as ReturnType<typeof vi.fn>;

const defaultPrefs = [
  { type: 'submission_reviewed', enabled: true },
  { type: 'nft_approved', enabled: true },
  { type: 'course_enrolled', enabled: false },
];

describe('NotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPrefs.mockResolvedValue(defaultPrefs);
    mockUpdatePrefs.mockResolvedValue(undefined);
  });

  it('renders preference toggles from API', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Submission Reviewed')).toBeInTheDocument();
      expect(screen.getByText('NFT Approved')).toBeInTheDocument();
      expect(screen.getByText('Course Enrolled')).toBeInTheDocument();
    });

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(3);
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    expect(switches[2]).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles a preference and saves', async () => {
    const user = userEvent.setup();
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getAllByRole('switch')).toHaveLength(3);
    });

    // Toggle the first switch (submission_reviewed: true → false)
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);
    expect(switches[0]).toHaveAttribute('aria-checked', 'false');

    // Save
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdatePrefs).toHaveBeenCalledWith([
        { type: 'submission_reviewed', enabled: false },
        { type: 'nft_approved', enabled: true },
        { type: 'course_enrolled', enabled: false },
      ]);
    });
    expect(screen.getByText('Preferences saved')).toBeInTheDocument();
  });

  it('shows error state on load failure', async () => {
    mockGetPrefs.mockRejectedValue(new Error('fail'));
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load preferences')).toBeInTheDocument();
    });
  });

  it('shows error state on save failure', async () => {
    const user = userEvent.setup();
    mockUpdatePrefs.mockRejectedValue(new Error('fail'));
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getAllByRole('switch')).toHaveLength(3);
    });

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Failed to save preferences')).toBeInTheDocument();
    });
  });
});
