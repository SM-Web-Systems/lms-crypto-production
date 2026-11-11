import {render, waitFor, act} from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import {PushNotificationsBridge} from '@/components/PushNotifications';
import {pushNotifications} from '@/services/pushNotifications';

const mockPush = jest.fn();
const mockRouter = {push: mockPush};
let mockPath = '/';
let mockLoading = true;
let mockRevision = 1;
const notificationId = 'a3333333-3333-4333-8333-333333333333';

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => ({key: 'root'}),
  usePathname: () => mockPath,
  useSegments: () => [],
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({user: {id: 'owner'}, isLoading: mockLoading, walletSignInPending: false}),
}));

jest.mock('@/services/pushNotifications', () => ({
  supportsNativePush: true,
  loadNativeNotifications: () => jest.requireMock('expo-notifications'),
  pushNotifications: {
    getSnapshot: () => ({revision: mockRevision}),
    notification: jest.fn(),
    rotate: jest.fn(),
    resume: jest.fn(),
  },
}));

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  setNotificationHandler: jest.fn(),
  addPushTokenListener: jest.fn(() => ({remove: jest.fn()})),
  addNotificationResponseReceivedListener: jest.fn(() => ({remove: jest.fn()})),
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
}));

const notifications = jest.mocked(Notifications);
const claim = jest.mocked(pushNotifications.notification);
const response = {
  actionIdentifier: 'default',
  notification: {request: {identifier: 'cold', content: {data: {notificationId, url: 'https://invalid.example'}}}},
} as unknown as Notifications.NotificationResponse;

beforeEach(() => {
  jest.clearAllMocks();
  mockRevision = 1;
  mockPath = '/';
  mockLoading = true;
  notifications.getLastNotificationResponse.mockReturnValue(response);
  claim.mockResolvedValue(notificationId);
});

it('waits for the restored session and home redirect before routing a cold notification tap', async () => {
  const screen = render(<PushNotificationsBridge />);
  await waitFor(() => expect(notifications.setNotificationHandler).toHaveBeenCalled());
  expect(notifications.getLastNotificationResponse).not.toHaveBeenCalled();
  mockLoading = false;
  screen.rerender(<PushNotificationsBridge />);
  expect(notifications.getLastNotificationResponse).not.toHaveBeenCalled();
  mockPath = '/dashboard';
  screen.rerender(<PushNotificationsBridge />);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({pathname: '/notification', params: {id: notificationId}}));
  expect(claim).toHaveBeenCalledWith(response.notification.request.content.data, true);
  expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
});

it('discards a tap whose secure record lookup finishes after an identity transition', async () => {
  mockLoading = false;
  mockPath = '/dashboard';
  let finish!: (id: string) => void;
  claim.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<PushNotificationsBridge />);
  await waitFor(() => expect(claim).toHaveBeenCalled());
  await act(async () => {
    mockRevision++;
    finish(notificationId);
  });
  expect(mockPush).not.toHaveBeenCalled();
});
