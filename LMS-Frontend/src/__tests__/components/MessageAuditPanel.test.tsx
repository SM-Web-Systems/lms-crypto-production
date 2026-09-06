/**
 * Admin Message Audit Panel — frontend tests.
 *
 * FE-ADMIN-01: Access control — non-admin sees nothing
 * FE-ADMIN-02: Conversation list rendering
 * FE-ADMIN-03: Deleted message rendering with metadata
 * FE-ADMIN-04: Anonymized sender handling
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetConversations = vi.fn();
const mockGetConversationMessages = vi.fn();

vi.mock('../../services/messageAuditService', () => ({
  messageAuditService: {
    getConversations: (...args: unknown[]) => mockGetConversations(...args),
    getConversationMessages: (...args: unknown[]) => mockGetConversationMessages(...args),
    getMessage: vi.fn(),
  },
}));

let mockUserRole = 'admin';

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', name: 'Admin', email: 'admin@test.com', role: mockUserRole },
  }),
}));

import { MessageAuditPanel } from '../../components/MessageAuditPanel';

const CONVERSATIONS = [
  {
    id: 'conv-1',
    participantIds: ['user-1', 'user-2'] as [string, string],
    participantNames: ['Alice', 'Bob'] as [string, string],
    updatedAt: '2026-09-06T12:00:00Z',
    messageCount: 5,
    deletedMessageCount: 2,
  },
  {
    id: 'conv-2',
    participantIds: ['user-3', 'user-4'] as [string, string],
    participantNames: ['Charlie', 'Dana'] as [string, string],
    updatedAt: '2026-09-05T08:00:00Z',
    messageCount: 3,
    deletedMessageCount: 0,
  },
];

const MESSAGES = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'user-1',
    body: 'Hello Bob',
    createdAt: '2026-09-06T10:00:00Z',
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    deletionType: null,
    senderName: 'Alice',
    senderEmail: 'alice@test.com',
    originalSenderName: null,
    originalSenderEmail: null,
  },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    senderId: 'user-1',
    body: 'This was a secret message',
    createdAt: '2026-09-06T10:05:00Z',
    isDeleted: true,
    deletedAt: '2026-09-06T10:10:00Z',
    deletedBy: 'user-1',
    deletionType: 'self_delete',
    senderName: 'Alice',
    senderEmail: 'alice@test.com',
    originalSenderName: null,
    originalSenderEmail: null,
  },
];

const MESSAGES_ANON = [
  {
    id: 'msg-3',
    conversationId: 'conv-1',
    senderId: 'user-deleted',
    body: 'Message from deleted user',
    createdAt: '2026-09-06T09:00:00Z',
    isDeleted: true,
    deletedAt: '2026-09-06T11:00:00Z',
    deletedBy: 'admin-1',
    deletionType: 'admin_delete',
    senderName: null,
    senderEmail: null,
    originalSenderName: 'Former User',
    originalSenderEmail: 'former@test.com',
  },
];

describe('FE-ADMIN-01: Access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'student';
  });

  afterEach(() => {
    mockUserRole = 'admin';
  });

  it('non-admin user sees access denied and no data is fetched', () => {
    render(<MessageAuditPanel />);

    expect(screen.getByText(/access denied/i)).toBeTruthy();
    expect(mockGetConversations).not.toHaveBeenCalled();
  });
});

describe('FE-ADMIN-02: Conversation list rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'admin';
  });

  it('admin sees list of conversations with metadata', async () => {
    mockGetConversations.mockResolvedValue(CONVERSATIONS);

    render(<MessageAuditPanel />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeTruthy();
    });

    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('2 deleted')).toBeTruthy();
    expect(screen.getByText('Charlie')).toBeTruthy();
    expect(screen.getByText('Dana')).toBeTruthy();
  });
});

describe('FE-ADMIN-03: Deleted message rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'admin';
  });

  it('deleted messages show original body, metadata, and visual distinction', async () => {
    mockGetConversations.mockResolvedValue(CONVERSATIONS);
    mockGetConversationMessages.mockResolvedValue(MESSAGES);

    render(<MessageAuditPanel />);

    const aliceRow = await screen.findByText('Alice');
    await userEvent.click(aliceRow.closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('This was a secret message')).toBeTruthy();
    });

    expect(screen.getByText('Hello Bob')).toBeTruthy();
    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(screen.getByText(/self-delete/i)).toBeTruthy();
  });
});

describe('FE-ADMIN-04: Anonymized sender handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'admin';
  });

  it('anonymized sender shows "Deleted User" with original identity', async () => {
    mockGetConversations.mockResolvedValue(CONVERSATIONS);
    mockGetConversationMessages.mockResolvedValue(MESSAGES_ANON);

    render(<MessageAuditPanel />);

    const aliceRow = await screen.findByText('Alice');
    await userEvent.click(aliceRow.closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Deleted User')).toBeTruthy();
    });

    expect(screen.getByText(/Former User/)).toBeTruthy();
    expect(screen.getByText(/admin-delete/i)).toBeTruthy();
  });
});
