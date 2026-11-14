import api from '@/lib/api';
import { assertApiSuccess } from '@/utils/apiError';
import type { ApiResponse } from '@/types/api';

export interface ClassInvitation { id: string; className: string; invitedBy: string; createdAt: string }

/** A teacher's invitation to a class. The learner joins (and the teacher sees their progress) only after accepting. */
export const classInvitationService = {
  async mine(): Promise<ClassInvitation[]> {
    const res = await api.get<ApiResponse<{ invitations: ClassInvitation[] }>>('/students/me/class-invitations');
    return assertApiSuccess(res, 'Could not load your class invitations.').invitations;
  },
  async respond(id: string, accept: boolean): Promise<void> {
    const res = await api.post<ApiResponse<{ status: string }>>(
      `/students/me/class-invitations/${encodeURIComponent(id)}/${accept ? 'accept' : 'decline'}`);
    assertApiSuccess(res, 'Could not answer the invitation.');
  },
};
