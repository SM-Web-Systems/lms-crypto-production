/**
 * DM Soft-Delete — frontend tests for tombstone rendering and delete UX.
 *
 * FE-01: Delete button shown for own messages, hidden for others
 * FE-02: Clicking Delete opens confirmation; canceling does nothing
 * FE-03: Confirming delete calls API and renders tombstone on success
 * FE-04: Error handling: failed delete shows error, message unchanged
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the component
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null, pathname: '/student/messages' }),
  };
});

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Alice', email: 'alice@test.com', role: 'student' },
  }),
}));

const mockGetConversations = vi.fn().mockResolvedValue([]);
const mockGetPeers = vi.fn().mockResolvedValue([]);
const mockGetMessages = vi.fn().mockResolvedValue([]);
const mockDeleteMessage = vi.fn();
const mockMarkRead = vi.fn();
const mockGetStudents = vi.fn().mockResolvedValue({ students: [] });

vi.mock('../../services/messageService', () => ({
  messageService: {
    getConversationsForUser: (...args: unknown[]) => mockGetConversations(...args),
    getMessages: (...args: unknown[]) => mockGetMessages(...args),
    sendMessage: vi.fn(),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
    getOrCreateConversation: vi.fn(),
    getUnreadCount: vi.fn().mockResolvedValue(0),
    markConversationRead: (...args: unknown[]) => mockMarkRead(...args),
    getOtherDisplayName: (_conv: { participantIds: string[]; participantNames: string[] }, userId: string) => {
      const idx = _conv.participantIds[0] === userId ? 1 : 0;
      return { otherUserId: _conv.participantIds[idx], otherUserName: _conv.participantNames[idx] };
    },
    generateId: () => 'test-id',
  },
}));

vi.mock('../../services/enrollmentService', () => ({
  enrollmentService: {
    getPeersInMyCourses: (...args: unknown[]) => mockGetPeers(...args),
  },
}));

vi.mock('../../services/studentsService', () => ({
  studentsService: {
    getAll: (...args: unknown[]) => mockGetStudents(...args),
  },
}));

vi.mock('../../services/userDirectoryService', () => ({
  userDirectoryService: {
    addMany: vi.fn(),
  },
}));

import Messages from '../../pages/Messages';

const CONV = {
  id: 'conv-1',
  participantIds: ['user-1', 'user-2'] as [string, string],
  participantNames: ['Alice', 'Bob'] as [string, string],
  updatedAt: new Date().toISOString(),
};

const MESSAGES = [
  { id: 'msg-1', conversationId: 'conv-1', senderId: 'user-1', body: 'Hello Bob', createdAt: '2026-09-06T10:00:00Z', isDeleted: false },
  { id: 'msg-2', conversationId: 'conv-1', senderId: 'user-2', body: 'Hi Alice', createdAt: '2026-09-06T10:01:00Z', isDeleted: false },
  { id: 'msg-3', conversationId: 'conv-1', senderId: 'user-1', body: null, createdAt: '2026-09-06T10:02:00Z', isDeleted: true },
];

async function renderWithConversation() {
  mockGetConversations.mockResolvedValue([CONV]);
  mockGetMessages.mockResolvedValue(MESSAGES);

  render(<Messages />);

  // Wait for conversations to load, then click on the conversation
  const convButton = await screen.findByText('Bob');
  await userEvent.click(convButton);

  // Wait for messages to render
  await screen.findByText('Hello Bob');
}

describe('FE-01: Delete button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows delete button on own messages', async () => {
    await renderWithConversation();

    // Own messages should have delete buttons (aria-label="Delete message")
    const deleteButtons = screen.getAllByLabelText('Delete message');
    // msg-1 is ours (non-deleted), msg-3 is ours but deleted (tombstone, no button)
    // So only 1 delete button for msg-1
    expect(deleteButtons).toHaveLength(1);
  });

  it('does not show delete button on received messages', async () => {
    await renderWithConversation();

    // msg-2 is from user-2 (Bob) — should not have a delete button
    // Verify by checking that "Hi Alice" message area doesn't contain a delete button
    const hiAlice = screen.getByText('Hi Alice');
    const msgContainer = hiAlice.closest('[class*="justify-start"]');
    expect(msgContainer).toBeTruthy();
    const trashInContainer = msgContainer?.querySelector('[aria-label="Delete message"]');
    expect(trashInContainer).toBeNull();
  });
});

describe('FE-02: Delete confirmation dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking delete opens confirmation dialog', async () => {
    await renderWithConversation();

    const deleteButton = screen.getByLabelText('Delete message');
    await userEvent.click(deleteButton);

    expect(screen.getByText('Delete message?')).toBeTruthy();
    expect(screen.getByText(/hide the message for everyone/i)).toBeTruthy();
  });

  it('clicking Cancel closes dialog without deleting', async () => {
    await renderWithConversation();

    const deleteButton = screen.getByLabelText('Delete message');
    await userEvent.click(deleteButton);

    // Dialog is open
    expect(screen.getByText('Delete message?')).toBeTruthy();

    // Click Cancel
    await userEvent.click(screen.getByText('Cancel'));

    // Dialog is closed
    expect(screen.queryByText('Delete message?')).toBeNull();

    // deleteMessage was NOT called
    expect(mockDeleteMessage).not.toHaveBeenCalled();

    // Message is still visible
    expect(screen.getByText('Hello Bob')).toBeTruthy();
  });
});

describe('FE-03: Successful deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirming delete calls API and renders tombstone', async () => {
    mockDeleteMessage.mockResolvedValue(undefined);
    await renderWithConversation();

    const deleteButton = screen.getByLabelText('Delete message');
    await userEvent.click(deleteButton);

    // Confirm delete
    await userEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockDeleteMessage).toHaveBeenCalledWith('msg-1');
    });

    // Dialog closes and message becomes tombstone
    await waitFor(() => {
      expect(screen.queryByText('Delete message?')).toBeNull();
    });

    // "Hello Bob" should no longer be visible — replaced by tombstone
    expect(screen.queryByText('Hello Bob')).toBeNull();

    // Should see 2 tombstones now (msg-1 just deleted + msg-3 was already deleted)
    const tombstones = screen.getAllByTestId('message-tombstone');
    expect(tombstones).toHaveLength(2);
  });
});

describe('FE-04: Error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('failed delete shows error and message stays', async () => {
    mockDeleteMessage.mockRejectedValue(new Error('Server error'));
    await renderWithConversation();

    const deleteButton = screen.getByLabelText('Delete message');
    await userEvent.click(deleteButton);

    // Confirm delete
    await userEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockDeleteMessage).toHaveBeenCalledWith('msg-1');
    });

    // Error message shown (getErrorMessage extracts the Error.message)
    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeTruthy();
    });

    // Original message should still be visible (not tombstoned)
    expect(screen.getByText('Hello Bob')).toBeTruthy();
  });
});

describe('Tombstone rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tombstone for pre-deleted messages', async () => {
    await renderWithConversation();

    // msg-3 is pre-deleted — should show tombstone
    const tombstones = screen.getAllByTestId('message-tombstone');
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].textContent).toContain('This message was deleted');
  });

  it('tombstone does not show delete button', async () => {
    await renderWithConversation();

    const tombstones = screen.getAllByTestId('message-tombstone');
    for (const ts of tombstones) {
      expect(ts.querySelector('[aria-label="Delete message"]')).toBeNull();
    }
  });
});
