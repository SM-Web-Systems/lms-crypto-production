/**
 * Forum Soft-Delete — frontend tests for tombstone rendering and delete UX.
 *
 * FE-F01: Delete button shown for own topics, hidden for others'
 * FE-F02: Delete button shown for own posts, hidden for others'
 * FE-F03: Confirming delete calls API and renders tombstone on success
 * FE-F04: Error handling: failed delete shows error, state unchanged
 * FE-F05: Tombstone rendering in topic list for deleted topics
 * FE-F06: Tombstone rendering in post list for deleted posts
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

const CURRENT_USER = { id: 'user-1', name: 'Alice', email: 'alice@test.com', role: 'student' };

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: CURRENT_USER }),
}));

const mockGetTopics = vi.fn();
const mockGetTopic = vi.fn();
const mockGetPosts = vi.fn();
const mockDeleteTopic = vi.fn();
const mockDeletePost = vi.fn();

vi.mock('../../services/forumService', () => ({
  forumService: {
    getTopics: (...args: unknown[]) => mockGetTopics(...args),
    getTopic: (...args: unknown[]) => mockGetTopic(...args),
    getPosts: (...args: unknown[]) => mockGetPosts(...args),
    createTopic: vi.fn(),
    createPost: vi.fn(),
    deleteTopic: (...args: unknown[]) => mockDeleteTopic(...args),
    deletePost: (...args: unknown[]) => mockDeletePost(...args),
  },
}));

vi.mock('../../services/courseService', () => ({
  courseService: {
    fetchCourses: vi.fn().mockResolvedValue([]),
  },
}));

import Forum from '../../pages/Forum';

// --- Fixtures ---

function makeTopic(overrides: Partial<{
  id: string; title: string; body: string; authorId: string; authorName: string; isDeleted: boolean;
}> = {}) {
  const id = overrides.id ?? 'topic-1';
  return {
    id,
    title: overrides.isDeleted ? null : (overrides.title ?? 'Test Topic'),
    body: overrides.isDeleted ? null : (overrides.body ?? 'Topic body text'),
    courseId: null,
    author: {
      id: overrides.authorId ?? 'user-1',
      name: overrides.authorName ?? 'Alice',
      email: 'alice@test.com',
      role: 'student' as const,
    },
    createdAt: '2026-09-06T12:00:00Z',
    postCount: 0,
    lastPostAt: null,
    isDeleted: overrides.isDeleted ?? false,
  };
}

function makePost(overrides: Partial<{
  id: string; body: string; authorId: string; authorName: string; isDeleted: boolean;
}> = {}) {
  return {
    id: overrides.id ?? 'post-1',
    topicId: 'topic-1',
    body: overrides.isDeleted ? null : (overrides.body ?? 'Post body text'),
    author: {
      id: overrides.authorId ?? 'user-1',
      name: overrides.authorName ?? 'Alice',
      email: 'alice@test.com',
      role: 'student' as const,
    },
    createdAt: '2026-09-06T12:05:00Z',
    isDeleted: overrides.isDeleted ?? false,
  };
}

// --- Tests ---

describe('Forum Soft-Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTopics.mockResolvedValue([]);
    mockGetPosts.mockResolvedValue([]);
  });

  describe('FE-F01: Delete button visibility — topics', () => {
    it('shows delete button on own topics', async () => {
      const ownTopic = makeTopic({ id: 'own-topic', authorId: 'user-1' });
      mockGetTopics.mockResolvedValue([ownTopic]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-topic-own-topic')).toBeTruthy();
      });
    });

    it('hides delete button on other users\' topics', async () => {
      const otherTopic = makeTopic({ id: 'other-topic', authorId: 'user-2', authorName: 'Bob' });
      mockGetTopics.mockResolvedValue([otherTopic]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByText('Test Topic')).toBeTruthy();
      });

      expect(screen.queryByTestId('delete-topic-other-topic')).toBeNull();
    });
  });

  describe('FE-F02: Delete button visibility — posts', () => {
    it('shows delete button on own posts in thread view', async () => {
      const topic = makeTopic({ id: 'topic-1' });
      const ownPost = makePost({ id: 'own-post', authorId: 'user-1' });
      mockGetTopics.mockResolvedValue([topic]);
      mockGetTopic.mockResolvedValue(topic);
      mockGetPosts.mockResolvedValue([ownPost]);

      render(<Forum />);

      // Click to open topic
      await waitFor(() => {
        expect(screen.getByText('Test Topic')).toBeTruthy();
      });
      await userEvent.click(screen.getByText('Test Topic'));

      await waitFor(() => {
        expect(screen.getByTestId('delete-post-own-post')).toBeTruthy();
      });
    });

    it('hides delete button on other users\' posts', async () => {
      const topic = makeTopic({ id: 'topic-1' });
      const otherPost = makePost({ id: 'other-post', authorId: 'user-2', authorName: 'Bob' });
      mockGetTopics.mockResolvedValue([topic]);
      mockGetTopic.mockResolvedValue(topic);
      mockGetPosts.mockResolvedValue([otherPost]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByText('Test Topic')).toBeTruthy();
      });
      await userEvent.click(screen.getByText('Test Topic'));

      await waitFor(() => {
        expect(screen.getByText('Post body text')).toBeTruthy();
      });

      expect(screen.queryByTestId('delete-post-other-post')).toBeNull();
    });
  });

  describe('FE-F03: Confirming delete calls API and renders tombstone', () => {
    it('deleting own topic calls API and refreshes list with tombstone', async () => {
      const topic = makeTopic({ id: 'topic-1', authorId: 'user-1' });
      mockGetTopics.mockResolvedValueOnce([topic]);
      mockDeleteTopic.mockResolvedValue(undefined);
      // After delete, the topic comes back as deleted
      const deletedTopic = makeTopic({ id: 'topic-1', authorId: 'user-1', isDeleted: true });
      mockGetTopics.mockResolvedValueOnce([deletedTopic]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-topic-topic-1')).toBeTruthy();
      });

      // Click delete button
      await userEvent.click(screen.getByTestId('delete-topic-topic-1'));

      // Confirm dialog should appear
      await waitFor(() => {
        expect(screen.getByText('Delete this topic?')).toBeTruthy();
      });

      // Click Delete in dialog
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockDeleteTopic).toHaveBeenCalledWith('topic-1');
      });

      // After reload, tombstone should appear
      await waitFor(() => {
        expect(screen.getByTestId('topic-tombstone')).toBeTruthy();
        expect(screen.getByText('This topic was removed')).toBeTruthy();
      });
    });
  });

  describe('FE-F04: Error handling on failed delete', () => {
    it('failed topic delete shows error and does not alter state', async () => {
      const topic = makeTopic({ id: 'topic-1', authorId: 'user-1' });
      mockGetTopics.mockResolvedValue([topic]);
      mockDeleteTopic.mockRejectedValue(new Error('Server error'));

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-topic-topic-1')).toBeTruthy();
      });

      await userEvent.click(screen.getByTestId('delete-topic-topic-1'));

      await waitFor(() => {
        expect(screen.getByText('Delete this topic?')).toBeTruthy();
      });

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      // Error should appear, topic title still visible
      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeTruthy();
      });

      expect(screen.getByText('Test Topic')).toBeTruthy();
    });
  });

  describe('FE-F05: Tombstone rendering — topic list', () => {
    it('deleted topics render as tombstones with no title/body', async () => {
      const activeTopic = makeTopic({ id: 'active', authorId: 'user-2', authorName: 'Bob', title: 'Active Topic' });
      const deletedTopic = makeTopic({ id: 'deleted', authorId: 'user-1', isDeleted: true });

      mockGetTopics.mockResolvedValue([activeTopic, deletedTopic]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByText('Active Topic')).toBeTruthy();
      });

      const tombstone = screen.getByTestId('topic-tombstone');
      expect(tombstone).toBeTruthy();
      expect(within(tombstone).getByText('This topic was removed')).toBeTruthy();

      // No delete button on tombstone
      expect(within(tombstone).queryByRole('button')).toBeNull();
    });
  });

  describe('FE-F06: Tombstone rendering — post list', () => {
    it('deleted posts render as tombstones with no body', async () => {
      const topic = makeTopic({ id: 'topic-1', authorId: 'user-2', authorName: 'Bob' });
      const activePost = makePost({ id: 'active-post', authorId: 'user-2', authorName: 'Bob', body: 'Active reply' });
      const deletedPost = makePost({ id: 'deleted-post', authorId: 'user-1', isDeleted: true });

      mockGetTopics.mockResolvedValue([topic]);
      mockGetTopic.mockResolvedValue(topic);
      mockGetPosts.mockResolvedValue([activePost, deletedPost]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByText('Test Topic')).toBeTruthy();
      });
      await userEvent.click(screen.getByText('Test Topic'));

      await waitFor(() => {
        expect(screen.getByText('Active reply')).toBeTruthy();
      });

      const tombstone = screen.getByTestId('post-tombstone');
      expect(tombstone).toBeTruthy();
      expect(within(tombstone).getByText('This reply was removed')).toBeTruthy();

      // No delete button on tombstone
      expect(within(tombstone).queryByRole('button')).toBeNull();
    });
  });
});
