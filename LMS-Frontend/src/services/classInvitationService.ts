import api from './api';

export interface MyClassInvitation { id: string; className: string; invitedBy: string; createdAt: string }

export const classInvitationService = {
  async mine(): Promise<MyClassInvitation[]> {
    const res = await api.get<{ success: boolean; data: { invitations: MyClassInvitation[] } }>('/students/me/class-invitations');
    return res.data.data.invitations;
  },
  async respond(id: string, accept: boolean): Promise<void> {
    await api.post(`/students/me/class-invitations/${encodeURIComponent(id)}/${accept ? 'accept' : 'decline'}`);
  },
};
