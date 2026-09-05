import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// We need to test PostAuthor which is not exported directly.
// We'll test through the Forum component by mocking services and rendering a topic thread.
// However, PostAuthor is an internal function — we'll test the rendering behavior
// via a lightweight extraction approach.

// Since PostAuthor is not exported, we test the Forum rendering with deleted user data.
// Mock all external dependencies first.

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'viewer-1', name: 'Viewer', email: 'viewer@test.com', role: 'student' },
  }),
}));

vi.mock('../../services/forumService', () => ({
  forumService: {
    getTopics: vi.fn().mockResolvedValue([]),
    getTopic: vi.fn(),
    getPosts: vi.fn().mockResolvedValue([]),
    createTopic: vi.fn(),
    createPost: vi.fn(),
  },
}));

vi.mock('../../services/courseService', () => ({
  courseService: {
    fetchCourses: vi.fn().mockResolvedValue([]),
  },
}));

import Forum from '../../pages/Forum';
import { forumService } from '../../services/forumService';

const mockGetTopics = forumService.getTopics as ReturnType<typeof vi.fn>;

describe('PostAuthor deleted user styling', () => {
  it('DA-01: renders muted italic styling for deleted user in topic list', async () => {
    mockGetTopics.mockResolvedValue([
      {
        id: 'topic-1',
        title: 'Test Topic',
        body: 'Body',
        author: { id: 'del-user', name: 'Deleted User', email: null, role: 'student', isDeleted: true },
        createdAt: new Date().toISOString(),
        postCount: 0,
      },
    ]);

    render(<Forum />);

    // Wait for topics to render
    const authorSpan = await screen.findByText('Deleted User');
    expect(authorSpan).toBeTruthy();
    expect(authorSpan.className).toContain('italic');
    expect(authorSpan.className).toContain('text-neutral-400');
    expect(authorSpan.getAttribute('title')).toBe('This user has deleted their account');
  });

  it('DA-02: renders normal styling for active user in topic list', async () => {
    mockGetTopics.mockResolvedValue([
      {
        id: 'topic-2',
        title: 'Active Topic',
        body: 'Body',
        author: { id: 'active-user', name: 'Active User', email: 'active@test.com', role: 'student' },
        createdAt: new Date().toISOString(),
        postCount: 0,
      },
    ]);

    render(<Forum />);

    const authorSpan = await screen.findByText('Active User');
    expect(authorSpan).toBeTruthy();
    expect(authorSpan.className).not.toContain('italic');
    expect(authorSpan.getAttribute('title')).toBeNull();
  });
});
