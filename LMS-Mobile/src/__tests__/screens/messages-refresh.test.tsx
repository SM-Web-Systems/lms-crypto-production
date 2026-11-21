import React from 'react';
import { ScrollView } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import MessagesScreen from '@/app/(student)/messages';
import { messageService } from '@/services/messageService';
import { ApiRequestError } from '@/utils/apiError';

// Each screen focus runs the latest callback the screen registered.
let mockFocus: (() => void) | undefined;
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { mockFocus = cb; require('react').useEffect(() => cb(), [cb]); },
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me', permissions: [] } }) }));
jest.mock('@/services/enrollmentService', () => ({ enrollmentService: { getPeersInMyCourses: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/services/messageService', () => ({
  messageService: {
    getConversationsForUser: jest.fn(), getMessages: jest.fn(), sendMessage: jest.fn(), markConversationRead: jest.fn().mockResolvedValue(undefined),
    getOtherDisplayName: jest.fn(() => ({ otherUserId: 'pat', otherUserName: 'Pat Lee' })),
  },
}));
const svc = messageService as jest.Mocked<typeof messageService>;
const conv = { id: 'c-1', participantIds: ['me', 'pat'] as [string, string], participantNames: ['Me', 'Pat Lee'] as [string, string], updatedAt: '2026-11-21T09:00:00Z' };
const msg = (id: string, body: string) => ({ id, conversationId: 'c-1', senderId: 'pat', body, createdAt: '2026-11-21T09:00:00Z' });

beforeEach(() => {
  jest.clearAllMocks();
  svc.getConversationsForUser.mockResolvedValue([conv]);
  svc.getMessages.mockResolvedValue([msg('m-1', 'Hello')]);
});

const pullToRefresh = () => act(async () => {
  screen.UNSAFE_getAllByType(ScrollView).at(-1)!.props.refreshControl.props.onRefresh();
});

describe('messages refresh', () => {
  it('reloads the conversation list on focus and on pull to refresh', async () => {
    render(<MessagesScreen />);
    await screen.findByText('Pat Lee');
    expect(svc.getConversationsForUser).toHaveBeenCalledTimes(1);
    await act(async () => mockFocus!());
    expect(svc.getConversationsForUser).toHaveBeenCalledTimes(2);
    await pullToRefresh();
    expect(svc.getConversationsForUser).toHaveBeenCalledTimes(3);
  });

  it('offers retry when the list fails to load', async () => {
    svc.getConversationsForUser.mockRejectedValueOnce(new ApiRequestError({ message: 'Could not load conversations.', status: 500 }));
    render(<MessagesScreen />);
    expect(await screen.findByText('Could not load conversations.')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Pat Lee')).toBeTruthy();
    expect(screen.queryByText('Could not load conversations.')).toBeNull();
  });

  it('shows new messages in an open thread on focus and on pull to refresh', async () => {
    render(<MessagesScreen />);
    fireEvent.press(await screen.findByText('Pat Lee'));
    expect(await screen.findByText('Hello')).toBeTruthy();
    svc.getMessages.mockResolvedValue([msg('m-1', 'Hello'), msg('m-2', 'Are you there?')]);
    await act(async () => mockFocus!());
    expect(await screen.findByText('Are you there?')).toBeTruthy();
    svc.getMessages.mockResolvedValue([msg('m-1', 'Hello'), msg('m-2', 'Are you there?'), msg('m-3', 'Third')]);
    await pullToRefresh();
    expect(await screen.findByText('Third')).toBeTruthy();
  });

  it('shows a failed thread load as an error with retry, not as an empty thread', async () => {
    svc.getMessages.mockRejectedValueOnce(new ApiRequestError({ message: 'Could not load messages.', status: 500 }));
    render(<MessagesScreen />);
    fireEvent.press(await screen.findByText('Pat Lee'));
    expect(await screen.findByText('Could not load messages.')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Hello')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Could not load messages.')).toBeNull());
  });

  it('shows a failed send inside the thread', async () => {
    svc.sendMessage.mockRejectedValueOnce(new ApiRequestError({ message: 'Could not send your message.', status: 500 }));
    render(<MessagesScreen />);
    fireEvent.press(await screen.findByText('Pat Lee'));
    await screen.findByText('Hello');
    fireEvent.changeText(screen.getByPlaceholderText('Write a message…'), 'Hi Pat');
    fireEvent.press(screen.getByText('Send'));
    expect(await screen.findByText('Could not send your message.')).toBeTruthy();
  });

  it('does not claim there are no conversations when the list failed to load', async () => {
    svc.getConversationsForUser.mockRejectedValueOnce(new ApiRequestError({ message: 'Could not load conversations.', status: 500 }));
    render(<MessagesScreen />);
    await screen.findByText('Could not load conversations.');
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });
});

