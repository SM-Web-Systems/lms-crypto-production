import api from './api';

export interface MyParentInvitation { id: string; parentName: string; createdAt: string }
export interface SentParentInvitation { id: string; status: string; createdAt: string; respondedAt: string | null; name: string; email: string; emailed?: boolean }

export const parentInvitationService = {
  /** Learner: parents waiting for an answer. */
  async mine(): Promise<MyParentInvitation[]> {
    const res = await api.get<{ success: boolean; data: { invitations: MyParentInvitation[] } }>('/students/me/parent-invitations');
    return res.data.data.invitations;
  },
  async respond(id: string, accept: boolean): Promise<void> {
    await api.post(`/students/me/parent-invitations/${encodeURIComponent(id)}/${accept ? 'accept' : 'decline'}`);
  },
  /** Parent: invite a learner who already has an account. */
  async invite(email: string): Promise<string> {
    const res = await api.post<{ success: boolean; message: string }>('/parent/children/invite', { email });
    return res.data.message;
  },
  async sent(): Promise<SentParentInvitation[]> {
    const res = await api.get<{ success: boolean; data: { invitations: SentParentInvitation[]; emailed?: Array<{ id: string; email: string; createdAt: string }> } }>('/parent/children/invitations');
    const emailed = (res.data.data.emailed ?? []).map((e) => ({ id: e.id, status: 'pending', createdAt: e.createdAt, respondedAt: null, name: '', email: e.email, emailed: true }));
    return [...res.data.data.invitations, ...emailed];
  },
  /** An emailed sign-up link the signed-in learner opened. Turns it into a request they can accept. */
  async claim(token: string): Promise<void> {
    await api.post('/invitations/claim', { token });
  },
  async cancel(id: string): Promise<void> {
    await api.delete(`/parent/children/invitations/${encodeURIComponent(id)}`);
  },
};
