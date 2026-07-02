export interface Conversation {
  id: string;
  participantIds: [string, string];
  participantNames: [string, string];
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
