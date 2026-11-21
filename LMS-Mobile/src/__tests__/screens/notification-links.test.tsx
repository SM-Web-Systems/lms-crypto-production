import {render, screen, fireEvent} from '@testing-library/react-native';
import {Linking} from 'react-native';
import NotificationScreen from '@/app/notification';
import {readPushNotification} from '@/services/pushNotifications';

const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({dismissTo: mockDismissTo, canGoBack: () => false, back: jest.fn(), replace: jest.fn()}),
  useLocalSearchParams: () => ({id: 'n-1'}),
  Redirect: () => null,
}));

const student = {
  id: 'u-1', workspaces: ['student'], defaultWorkspace: 'student',
  permissions: ['course.view', 'course.submit', 'reward.view_own', 'certificate.view_own', 'quiz.view', 'forum.view', 'document.view'],
};
let mockUser: Record<string, unknown> = student;
jest.mock('@/context/AuthContext', () => ({useAuth: () => ({user: mockUser, isLoading: false})}));

const mockSnapshot = {revision: 1};
jest.mock('@/services/pushNotifications', () => ({
  pushNotifications: {subscribe: () => () => undefined, getSnapshot: () => mockSnapshot},
  readPushNotification: jest.fn(),
  markPushNotificationRead: jest.fn(() => Promise.resolve()),
}));
const read = jest.mocked(readPushNotification);

function open(link: string | null) {
  read.mockResolvedValue({id: 'n-1', type: 't', title: 'Title', body: 'Body', link, read: true, createdAt: ''} as never);
  render(<NotificationScreen />);
}

beforeEach(() => { jest.clearAllMocks(); mockUser = student; });

it.each([
  ['/student/rewards', '/(student)/rewards'],
  ['/student/badges', '/(student)/certificates'],
  ['/student/course', '/(student)/course'],
  ['/student/submissions', '/(student)/submissions'],
  ['/student/quizzes', '/(student)/quizzes'],
  ['/student/messages', '/(student)/messages'],
  ['/profile', '/(student)/profile'],
  ['/student', '/(student)/dashboard'],
])('opens %s on the matching mobile screen', async (link, destination) => {
  open(link);
  fireEvent.press(await screen.findByText('Open in LMS'));
  expect(mockDismissTo).toHaveBeenCalledWith(destination);
});

it('hands a link with no mobile screen off to the web', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  open('/student/payments');
  fireEvent.press(await screen.findByText('Open on web'));
  expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/\/student\/payments$/));
  expect(screen.queryByText('Open in LMS')).toBeNull();
});

it('hands a learner link off to the web when this learner cannot open that screen', async () => {
  mockUser = {...student, permissions: ['course.view', 'course.submit']};
  open('/student/rewards');
  expect(await screen.findByText('Open on web')).toBeTruthy();
  expect(screen.queryByText('Open in LMS')).toBeNull();
});

it('hands an admin or sponsor link off to the web', async () => {
  mockUser = {id: 'a-1', workspaces: ['admin'], defaultWorkspace: 'admin', permissions: []};
  open('/admin/rewards');
  expect(await screen.findByText('Open on web')).toBeTruthy();
  expect(screen.queryByText('Open in LMS')).toBeNull();
});

it('says so when a notification has nothing to open', async () => {
  open(null);
  expect(await screen.findByText('There is no page to open for this notification.')).toBeTruthy();
  expect(screen.getByText('Back to your workspace')).toBeTruthy();
});
