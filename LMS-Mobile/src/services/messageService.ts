import api from '../lib/api';
import type { ApiResponse } from '../types/api';
import type { Conversation, Message } from '../types/message';
import { assertApiSuccess } from '../utils/apiError';

export const messageService = {
  async getConversationsForUser(_userId: string, _isAdmin?: boolean): Promise<Conversation[]> {
    const res = await api.get<ApiResponse<{ conversations: Conversation[] }>>('/messages/conversations');
    const data = assertApiSuccess(res, 'Could not load conversations.');
    return data.conversations ?? [];
  },

  getOtherDisplayName(
    conv: Conversation,
    userId: string,
    isAdmin?: boolean
  ): { otherUserId: string; otherUserName: string } {
    let idx: number;
    if (isAdmin && (conv.participantIds[0] === '__admin__' || conv.participantIds[1] === '__admin__')) {
      idx = conv.participantIds[0] === '__admin__' ? 1 : 0;
    } else {
      idx = conv.participantIds[0] === userId ? 1 : 0;
    }
    return { otherUserId: conv.participantIds[idx], otherUserName: conv.participantNames[idx] };
  },

  async getOrCreateConversation(_myUserId: string, _myUserName: string, otherUserId: string): Promise<Conversation> {
    const res = await api.post<ApiResponse<Conversation>>('/messages/conversations', { otherUserId });
    return assertApiSuccess(res, 'Could not open that conversation.');
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const res = await api.get<ApiResponse<{ messages: Message[] }>>(`/messages/conversations/${conversationId}/messages`);
    const data = assertApiSuccess(res, 'Could not load messages.');
    return data.messages ?? [];
  },

  async sendMessage(conversationId: string, _senderId: string, body: string): Promise<Message> {
    const res = await api.post<ApiResponse<Message>>(`/messages/conversations/${conversationId}/messages`, { body });
    return assertApiSuccess(res, 'Could not send your message.');
  },

  async getUnreadCount(): Promise<number> {
    try {
      const res = await api.get<ApiResponse<{ count: number }>>('/messages/unread-count');
      return res.data?.data?.count ?? 0;
    } catch {
      return 0;
    }
  },

  async markConversationRead(conversationId: string): Promise<void> {
    try {
      await api.post(`/messages/conversations/${conversationId}/read`, {});
    } catch {
      /* best-effort */
    }
  },
};
