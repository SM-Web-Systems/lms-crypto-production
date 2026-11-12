const mockDismissAll = jest.fn(async () => undefined);
const mockClearLast = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {easConfig: {projectId: '3624f515-98e6-4ff3-9a4e-bdbeaa30fbef'}, expoConfig: {extra: {}}},
  ExecutionEnvironment: {StoreClient: 'storeClient'},
}));
jest.mock('expo-notifications', () => ({
  dismissAllNotificationsAsync: () => mockDismissAll(),
  clearLastNotificationResponse: () => mockClearLast(),
  getPresentedNotificationsAsync: jest.fn(async () => []),
}), {virtual: true});
jest.mock('@/lib/api', () => ({__esModule: true, API_BASE_URL: 'https://example.invalid/api/v1', default: {}}));

import { dismissStaleNotifications, pushNotifications } from '@/services/pushNotifications';

beforeEach(() => { mockDismissAll.mockClear(); mockClearLast.mockClear(); });

it('clears every LMS notification from the tray when the installation is fenced', async () => {
  await dismissStaleNotifications(pushNotifications.getSnapshot().revision);
  expect(mockDismissAll).toHaveBeenCalledTimes(1);
  expect(mockClearLast).toHaveBeenCalledTimes(1);
});

it('does nothing for a fence that a newer change has already replaced', async () => {
  await dismissStaleNotifications(pushNotifications.getSnapshot().revision - 1);
  expect(mockDismissAll).not.toHaveBeenCalled();
});
