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
  body: string;
  createdAt: string;
}
