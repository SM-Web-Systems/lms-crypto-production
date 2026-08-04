import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock notificationService
vi.mock('../../services/notificationService', () => ({
  notificationService: {
    getNotifications: vi.fn(),
    markRead: vi.fn(),
  },
  // Type re-export not needed at runtime
}));

// Mock react-router-dom (partial — preserve other exports)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import NotificationBell from '../../components/NotificationBell';
import { notificationService } from '../../services/notificationService';

// Typed references for mocked functions
const mockGetNotifications = notificationService.getNotifications as ReturnType<typeof vi.fn>;
const mockMarkRead = notificationService.markRead as ReturnType<typeof vi.fn>;

// Factory helper
const makeNotification = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  type: 'submission_reviewed',
  title: 'Submission reviewed',
  body: 'Your essay has been approved.',
  read: false,
  link: '/student/submissions',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty notifications
    mockGetNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // TC1: Fetches on mount and renders bell
  it('fetches notifications on mount and renders bell button', async () => {
    render(<NotificationBell />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledOnce();
    });
  });

  // TC2: Shows unread badge count
  it('shows unread count badge when count > 0', async () => {
    mockGetNotifications.mockResolvedValue({ notifications: [makeNotification()], unreadCount: 3 });
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  // TC3: Caps badge at 99+
  it('caps unread badge at 99+ when count exceeds 99', async () => {
    mockGetNotifications.mockResolvedValue({ notifications: [], unreadCount: 150 });
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('99+')).toBeInTheDocument();
    });
    expect(screen.queryByText('150')).not.toBeInTheDocument();
  });

  // TC4: Opens dropdown with notification list on click
  it('opens dropdown showing notification titles on bell click', async () => {
    const user = userEvent.setup();
    mockGetNotifications.mockResolvedValue({
      notifications: [
        makeNotification({ title: 'Submission reviewed' }),
        makeNotification({ title: 'NFT approved' }),
      ],
      unreadCount: 2,
    });
    render(<NotificationBell />);

    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Submission reviewed')).toBeInTheDocument();
    expect(screen.getByText('NFT approved')).toBeInTheDocument();
  });

  // TC5: Shows empty state
  it('shows "No notifications" when list is empty', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  // TC6: Marks notification as read and navigates
  it('marks unread notification as read and navigates on click', async () => {
    const user = userEvent.setup();
    const notif = makeNotification({ id: 'n-1', read: false, link: '/student/submissions' });
    mockGetNotifications.mockResolvedValue({ notifications: [notif], unreadCount: 1 });
    mockMarkRead.mockResolvedValue(undefined);

    render(<NotificationBell />);
    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());

    // Open dropdown
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    // Click notification
    await user.click(screen.getByText('Submission reviewed'));

    expect(mockMarkRead).toHaveBeenCalledWith('n-1');
    expect(mockNavigate).toHaveBeenCalledWith('/student/submissions');
    // Dropdown should be closed
    expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
  });

  // TC7: Closes dropdown on outside click
  it('closes dropdown on outside mousedown', async () => {
    const user = userEvent.setup();
    mockGetNotifications.mockResolvedValue({ notifications: [makeNotification()], unreadCount: 1 });
    render(<NotificationBell />);

    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    // Dropdown is open
    expect(screen.getByText('Notifications')).toBeInTheDocument();

    // Simulate outside click
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
      // The dropdown header "Notifications" should also be gone
      // But the bell button text is aria-label, not visible text, so check the dropdown container
      expect(screen.queryByText('Submission reviewed')).not.toBeInTheDocument();
    });
  });

  // TC8: Polls every 60 seconds
  it('polls for notifications every 60 seconds', async () => {
    vi.useFakeTimers();
    mockGetNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });

    await act(async () => {
      render(<NotificationBell />);
    });

    // Initial fetch on mount
    expect(mockGetNotifications).toHaveBeenCalledTimes(1);

    // Advance 60 seconds
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(mockGetNotifications).toHaveBeenCalledTimes(2);

    // Advance another 60 seconds
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(mockGetNotifications).toHaveBeenCalledTimes(3);
  });
});
