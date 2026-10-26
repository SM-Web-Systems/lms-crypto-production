import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import MessagesScreen from '@/app/(student)/messages';
import { enrollmentService } from '@/services/enrollmentService';
import { messageService } from '@/services/messageService';

let mockUser: object;
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser})}));
jest.mock('@/services/messageService', () => ({messageService: { getConversationsForUser: jest.fn().mockResolvedValue([]) }}));
jest.mock('@/services/enrollmentService', () => ({enrollmentService: {getPeersInMyCourses: jest.fn().mockResolvedValue([])}}));

beforeEach(() => jest.clearAllMocks());
it.each([
  ['custom directory capability', {permissions:['user.view_all'],rbacRoles:['support-desk']}, true],
  ['stale admin hint', {role:'admin',permissions:[],rbacRoles:[]}, false],
  ['ordinary learner without legacy field', {permissions:['course.view'],rbacRoles:['student']}, false],
])('mobile peer discovery uses current capability: %s', async (_name, context, allowed) => {
  mockUser = {id:'viewer',name:'Viewer',...context};
  render(<MessagesScreen />);
  await waitFor(() => expect(enrollmentService.getPeersInMyCourses).toHaveBeenCalledWith('viewer', allowed));
  expect(messageService.getConversationsForUser).toHaveBeenCalledWith('viewer', allowed);
});
