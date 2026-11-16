import api from './api';

export interface MyConnections {
  parents: Array<{ id: string; name: string; linkedAt: string }>;
  groups: Array<{ id: string; name: string; groupType: 'class' | 'team'; ownerName: string }>;
}
export interface GroupMember { id: string; name: string; email: string }

export const connectionService = {
  async mine(): Promise<MyConnections> {
    const res = await api.get<{ success: boolean; data: MyConnections }>('/students/me/connections');
    return res.data.data;
  },
  async leaveParent(parentId: string): Promise<void> {
    await api.delete(`/students/me/parents/${encodeURIComponent(parentId)}`);
  },
  async leaveGroup(groupId: string): Promise<void> {
    await api.delete(`/students/me/groups/${encodeURIComponent(groupId)}`);
  },
  async unlinkChild(childId: string): Promise<void> {
    await api.delete(`/parent/children/${encodeURIComponent(childId)}`);
  },
  async members(kind: 'class' | 'team', groupId: string): Promise<GroupMember[]> {
    const id = encodeURIComponent(groupId);
    if (kind === 'class') {
      const res = await api.get<{ success: boolean; data: { students: GroupMember[] } }>(`/teacher/classes/${id}/students`);
      return res.data.data.students;
    }
    const res = await api.get<{ success: boolean; data: { members: GroupMember[] } }>(`/employer/teams/${id}/members`);
    return res.data.data.members;
  },
  async removeMember(kind: 'class' | 'team', groupId: string, userId: string): Promise<void> {
    const path = kind === 'class' ? `/teacher/classes/${encodeURIComponent(groupId)}/students` : `/employer/teams/${encodeURIComponent(groupId)}/members`;
    await api.delete(`${path}/${encodeURIComponent(userId)}`);
  },
};
