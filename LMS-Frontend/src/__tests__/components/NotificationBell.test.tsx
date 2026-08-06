import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock notificationService
vi.mock('../../services/notificationService', () => ({
  notificationService: {
    getNotifications: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
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
const mockMarkAllRead = (notificationService as any).markAllRead as ReturnType<typeof vi.fn>;

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

const emptyResponse = { notifications: [], unreadCount: 0, page: 1, totalPages: 0, total: 0 };

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNotifications.mockResolvedValue(emptyResponse);
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
    mockGetNotifications.mockResolvedValue({ ...emptyResponse, notifications: [makeNotification()], unreadCount: 3 });
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  // TC3: Caps badge at 99+
  it('caps unread badge at 99+ when count exceeds 99', async () => {
    mockGetNotifications.mockResolvedValue({ ...emptyResponse, unreadCount: 150 });
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
      ...emptyResponse,
      notifications: [
        makeNotification({ title: 'Submission reviewed' }),
        makeNotification({ title: 'NFT approved' }),
      ],
      unreadCount: 2,
    });
    render(<NotificationBell />);

    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

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
    mockGetNotifications.mockResolvedValue({ ...emptyResponse, notifications: [notif], unreadCount: 1 });
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
    mockGetNotifications.mockResolvedValue({ ...emptyResponse, notifications: [makeNotification()], unreadCount: 1 });
    render(<NotificationBell />);

    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    // Dropdown is open
    expect(screen.getByText('Submission reviewed')).toBeInTheDocument();

    // Simulate outside click
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Submission reviewed')).not.toBeInTheDocument();
    });
  });

  // TC8: Polls every 30 seconds
  it('polls for notifications every 30 seconds', async () => {
    vi.useFakeTimers();
    mockGetNotifications.mockResolvedValue(emptyResponse);

    await act(async () => {
      render(<NotificationBell />);
    });

    expect(mockGetNotifications).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(mockGetNotifications).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(mockGetNotifications).toHaveBeenCalledTimes(3);
  });

  // TC9: Mark all read button works
  it('marks all as read when "Read all" button is clicked', async () => {
    const user = userEvent.setup();
    mockGetNotifications.mockResolvedValue({
      ...emptyResponse,
      notifications: [makeNotification(), makeNotification()],
      unreadCount: 2,
    });
    mockMarkAllRead.mockResolvedValue({ updated: 2 });

    render(<NotificationBell />);
    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());

    // Open dropdown
    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    // Click "Read all"
    const readAllButton = screen.getByText('Read all');
    expect(readAllButton).toBeInTheDocument();
    await user.click(readAllButton);

    await waitFor(() => {
      expect(mockMarkAllRead).toHaveBeenCalledOnce();
    });
  });

  // TC10: Settings link navigates to notification settings
  it('navigates to notification settings page', async () => {
    const user = userEvent.setup();
    mockGetNotifications.mockResolvedValue(emptyResponse);

    render(<NotificationBell />);
    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    const settingsButton = screen.getByTitle('Notification settings');
    await user.click(settingsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/settings/notifications');
  });
});
