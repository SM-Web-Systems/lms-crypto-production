import api from './api';
import type { ApiResponse } from '../types/api';
import type { AdminConversation, AdminMessage } from '../types/message';
import { assertApiSuccess } from '../utils/apiError';

export const messageAuditService = {
  async getConversations(): Promise<AdminConversation[]> {
    const res = await api.get<ApiResponse<{ conversations: AdminConversation[] }>>(
      '/messages/admin/conversations'
    );
    const data = assertApiSuccess(res, 'Could not load conversations.');
    return data.conversations ?? [];
  },

  async getConversationMessages(conversationId: string): Promise<AdminMessage[]> {
    const res = await api.get<ApiResponse<{ messages: AdminMessage[] }>>(
      `/messages/admin/conversations/${conversationId}/messages`
    );
    const data = assertApiSuccess(res, 'Could not load messages.');
    return data.messages ?? [];
  },

  async getMessage(messageId: string): Promise<AdminMessage> {
    const res = await api.get<ApiResponse<{ message: AdminMessage }>>(
      `/messages/admin/messages/${messageId}`
    );
    const data = assertApiSuccess(res, 'Could not load message.');
    return data.message;
  },
};
