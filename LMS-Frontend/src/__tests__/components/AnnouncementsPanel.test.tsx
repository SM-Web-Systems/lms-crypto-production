import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/announcementService', () => ({
  announcementService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../services/courseService', () => ({
  courseService: {
    fetchCourses: vi.fn(),
  },
}));

import { AnnouncementsPanel } from '../../components/AnnouncementsPanel';
import { announcementService } from '../../services/announcementService';
import { courseService } from '../../services/courseService';

const mockGetAll = announcementService.getAll as ReturnType<typeof vi.fn>;
const mockDelete = announcementService.delete as ReturnType<typeof vi.fn>;
const mockFetchCourses = courseService.fetchCourses as ReturnType<typeof vi.fn>;

const makeAnnouncement = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  title: 'Test Announcement',
  body: 'Short body text.',
  scope: 'general' as const,
  courseId: null,
  courseTitle: null,
  courseCode: null,
  authorId: 'a1',
  authorName: 'Admin',
  pinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('AnnouncementsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([]);
    mockFetchCourses.mockResolvedValue([]);
  });

  // AP-1: Loads and displays announcements
  it('loads and displays announcements on mount', async () => {
    mockGetAll.mockResolvedValue([
      makeAnnouncement({ title: 'First Post' }),
      makeAnnouncement({ title: 'Second Post' }),
    ]);
    render(<AnnouncementsPanel isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByText('First Post')).toBeInTheDocument();
      expect(screen.getByText('Second Post')).toBeInTheDocument();
    });
  });

  // AP-2: Shows error state with retry
  it('shows error state with retry button', async () => {
    mockGetAll.mockRejectedValue(new Error('Network error'));
    render(<AnnouncementsPanel isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByText('Could not load announcements')).toBeInTheDocument();
    });
    expect(screen.getByText('retry')).toBeInTheDocument();
  });

  // AP-3: Student empty state
  it('shows student empty message when no announcements', async () => {
    render(<AnnouncementsPanel isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByText(/No announcements right now/)).toBeInTheDocument();
    });
  });

  // AP-4: Admin empty state
  it('shows admin empty message when no announcements', async () => {
    render(<AnnouncementsPanel isAdmin={true} />);
    await waitFor(() => {
      expect(screen.getByText(/No announcements yet/)).toBeInTheDocument();
    });
  });

  // AP-5: Renders pinned and scope badges
  it('renders pinned and scope badges correctly', async () => {
    mockGetAll.mockResolvedValue([
      makeAnnouncement({ title: 'Pinned General', pinned: true, scope: 'general' }),
      makeAnnouncement({ title: 'Course Scoped', scope: 'course', courseCode: 'BVC-101' }),
    ]);
    render(<AnnouncementsPanel isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByText('Pinned')).toBeInTheDocument();
      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.getByText('BVC-101')).toBeInTheDocument();
    });
  });

  // AP-6: Body truncation + expand
  it('truncates long body and expands on click', async () => {
    const longBody = 'A'.repeat(300);
    mockGetAll.mockResolvedValue([makeAnnouncement({ body: longBody })]);
    const user = userEvent.setup();
    render(<AnnouncementsPanel isAdmin={false} />);

    await waitFor(() => {
      expect(screen.getByText('Read more')).toBeInTheDocument();
    });
    // Body should be truncated (ends with …)
    expect(screen.getByText(/A{50,}…/)).toBeInTheDocument();

    await user.click(screen.getByText('Read more'));
    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(screen.getByText(longBody)).toBeInTheDocument();
  });

  // AP-7: Admin-only buttons visible / hidden for students
  it('shows admin buttons for admin, hides for student', async () => {
    mockGetAll.mockResolvedValue([makeAnnouncement({ title: 'Test' })]);

    const { unmount } = render(<AnnouncementsPanel isAdmin={true} />);
    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());
    expect(screen.getByText('New announcement')).toBeInTheDocument();
    expect(screen.getByTitle('Edit')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
    unmount();

    render(<AnnouncementsPanel isAdmin={false} />);
    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());
    expect(screen.queryByText('New announcement')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  // AP-8: Form validation — title required
  it('validates title is required before save', async () => {
    const user = userEvent.setup();
    render(<AnnouncementsPanel isAdmin={true} />);
    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());

    await user.click(screen.getByText('New announcement'));
    await waitFor(() => expect(screen.getByText('Post announcement')).toBeInTheDocument());

    // Click save without title
    await user.click(screen.getByText('Post announcement'));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  // AP-9: Delete with confirmation
  it('deletes announcement after confirmation', async () => {
    const ann = makeAnnouncement({ id: 'ann-1', title: 'To Delete' });
    mockGetAll.mockResolvedValue([ann]);
    mockDelete.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AnnouncementsPanel isAdmin={true} />);
    await waitFor(() => expect(screen.getByText('To Delete')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByTitle('Delete'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('ann-1');
      expect(screen.queryByText('To Delete')).not.toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  // AP-10: Opens and closes create modal
  it('opens create modal and closes on backdrop click', async () => {
    const user = userEvent.setup();
    render(<AnnouncementsPanel isAdmin={true} />);
    await waitFor(() => expect(mockGetAll).toHaveBeenCalled());

    await user.click(screen.getByText('New announcement'));
    await waitFor(() => {
      expect(screen.getByText('New announcement', { selector: 'h2' })).toBeInTheDocument();
    });

    // Close by clicking backdrop (the fixed overlay div)
    const backdrop = screen.getByText('New announcement', { selector: 'h2' }).closest('.fixed');
    if (backdrop) fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByText('Post announcement')).not.toBeInTheDocument();
    });
  });
});
