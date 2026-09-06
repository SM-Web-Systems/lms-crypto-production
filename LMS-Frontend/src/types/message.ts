// 1:1 messaging between users (e.g. student ↔ admin)

export interface Conversation {
  id: string;
  participantIds: [string, string];
  participantNames: [string, string]; // names in same order as participantIds
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  createdAt: string;
  isDeleted?: boolean;
}

export interface AdminConversation {
  id: string;
  participantIds: [string, string];
  participantNames: [string, string];
  updatedAt: string;
  messageCount: number;
  deletedMessageCount: number;
}

export interface AdminMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  deletionType: string | null;
  senderName?: string;
  senderEmail?: string;
  originalSenderName: string | null;
  originalSenderEmail: string | null;
}
