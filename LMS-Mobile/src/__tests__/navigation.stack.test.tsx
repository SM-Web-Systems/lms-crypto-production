import { useCallback, useState } from 'react';
import { BackHandler, Pressable, Text, TextInput } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Redirect, router as appRouter, useRouter } from 'expo-router';
import { useInScreenBack } from '@/utils/navigation';

// jest.setup.js stubs expo-router for screen tests; this suite needs the real router.
jest.unmock('expo-router');
// The router's own source is compiled with NativeWind's JSX import; jest.setup.js stubs that module without it.
jest.mock('react-native-css-interop', () => {
  const { createElement } = jest.requireActual('react');
  return { cssInterop: jest.fn(), createElement, createInteropElement: createElement };
});
// React Native ships no BackHandler test double; this one dispatches like Android (newest listener first).
jest.mock('react-native/Libraries/Utilities/BackHandler', () => {
  const listeners: (() => boolean | null | undefined)[] = [];
  const handler = {
    addEventListener: (_: string, fn: () => boolean) => {
      listeners.push(fn);
      return { remove: () => { listeners.splice(listeners.indexOf(fn), 1); } };
    },
    exitApp: jest.fn(),
    pressBack: () => { if (![...listeners].reverse().some(fn => fn())) handler.exitApp(); },
  };
  return { __esModule: true, default: handler };
});
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@/context/AuthContext', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  const learner = {
    id: 'u1', email: 'learner@example.test', workspaces: ['student'],
    permissions: ['course.view', 'quiz.view', 'reward.view_own', 'certificate.view_own'],
  };
  let user: typeof learner | null = learner;
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
  return {
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => {
      const current = useSyncExternalStore(subscribe, () => user);
      return { user: current, isLoading: false, isAuthenticated: !!current };
    },
    mockSignIn: (signedIn: boolean, extra: Partial<typeof learner> & Record<string, unknown> = {}) => {
      user = signedIn ? { ...learner, ...extra } : null; listeners.forEach(fn => fn());
    },
  };
});
jest.mock('@/services/pushNotifications', () => {
  const snapshot = { revision: 1 };
  return {
  pushNotifications: { subscribe: () => () => undefined, getSnapshot: () => snapshot },
  readPushNotification: async () => ({ title: 'New lesson', body: 'Open it', link: '/student/course', read: true }),
  markPushNotificationRead: async () => undefined,
  };
});
jest.mock('@/components/SessionBoundary', () => ({ SessionBoundary: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/PushNotifications', () => ({ PushNotificationsBridge: () => null }));

const RootLayout = jest.requireActual('@/app/_layout').default;
const Index = jest.requireActual('@/app/index').default;
const NotificationScreen = jest.requireActual('@/app/notification').default;
const { mockSignIn } = jest.requireMock('@/context/AuthContext') as { mockSignIn: (signedIn: boolean, extra?: Record<string, unknown>) => void };
const WorkspaceScreen = jest.requireActual('@/app/workspace').default;
/** A staff member who also studies, and whose default workspace is not student: sign-in lands on Workspace. */
const staffLearner = { workspaces: ['student', 'admin'], defaultWorkspace: 'admin' };
const StudentLayout = jest.requireActual('@/app/(student)/_layout').default;

/** Stands in for a quiz half answered: its answer lives only in component state. */
function HalfAnsweredQuiz() {
  const [answer, setAnswer] = useState('');
  const router = useRouter();
  return <>
    <TextInput testID="answer" value={answer} onChangeText={setAnswer} />
    <Pressable onPress={() => router.push('/notification')}><Text>Push tap</Text></Pressable>
    <Pressable onPress={() => router.push('/(student)/rewards')}><Text>Open rewards</Text></Pressable>
  </>;
}
function Pushed() {
  const router = useRouter();
  return <Pressable onPress={() => router.back()}><Text>Back</Text></Pressable>;
}
const Empty = () => null;
/** Stands in for the Course tab: a lesson open inside the screen, closed by Android Back. */
function CourseWithLesson() {
  const [open, setOpen] = useState(true);
  const stepBack = useCallback(() => { if (!open) return false; setOpen(false); return true; }, [open]);
  useInScreenBack(stepBack);
  return <Text>{open ? 'Lesson open' : 'Course list'}</Text>;
}
function Dashboard() {
  const router = useRouter();
  return <>
    <Pressable onPress={() => router.navigate('/(student)/course')}><Text>Go to course</Text></Pressable>
    <Pressable onPress={() => router.push('/account')}><Text>Account</Text></Pressable>
  </>;
}
function SignedInOnly() {
  const { user } = jest.requireMock('@/context/AuthContext').useAuth();
  return user ? <Pushed /> : <Redirect href="/(auth)/sign-in" />;
}
let signInAs: Record<string, unknown> = {};
function SignIn() {
  const router = useRouter();
  return <Pressable onPress={() => { mockSignIn(true, signInAs); router.replace('/'); }}><Text>Sign in</Text></Pressable>;
}
/** The routes on the root Stack (the container holds that Stack as its only route). */
const rootRoutes = () => app.getRouterState()?.routes[0].state?.routes.map(route => route.name);
const pressBack = () => (BackHandler as unknown as { pressBack: () => void }).pressBack();

let app: ReturnType<typeof renderRouter>;
function renderApp(initialUrl = '/quizzes', workspace: () => React.ReactElement | null = Pushed, course: () => React.ReactElement | null = Empty) {
  app = renderRouter({
    _layout: RootLayout,
    index: Index,
    '(auth)/_layout': jest.requireActual('@/app/(auth)/_layout').default,
    '(auth)/sign-in': SignIn,
    '(student)/_layout': StudentLayout,
    '(student)/dashboard': Dashboard,
    '(student)/course': course,
    '(student)/submissions': Empty,
    '(student)/messages': Empty,
    '(student)/certificates': Empty,
    '(student)/profile': Empty,
    '(student)/certificate-detail': Empty,
    '(student)/quizzes': HalfAnsweredQuiz,
    '(student)/forum': Empty,
    '(student)/documents': Empty,
    '(student)/rewards': Empty,
    notification: NotificationScreen,
    account: SignedInOnly,
    workspace,
  }, { initialUrl });
}

describe('root Stack keeps the tab tree mounted', () => {
  it('a push tap opens Notification over the quiz, and Back returns with the answer kept', async () => {
    renderApp();
    fireEvent.changeText(screen.getByTestId('answer'), 'half done');
    fireEvent.press(screen.getByText('Push tap'));
    expect(app.getPathname()).toBe('/notification');
    fireEvent.press(await screen.findByText('Back to your workspace'));
    expect(app.getPathname()).toBe('/quizzes');
    expect(screen.getByTestId('answer').props.value).toBe('half done');
  });

  it('Android back pops a pushed screen one level', async () => {
    renderApp();
    fireEvent.changeText(screen.getByTestId('answer'), 'kept');
    fireEvent.press(screen.getByText('Push tap'));
    act(() => { pressBack(); });
    expect(app.getPathname()).toBe('/quizzes');
    expect(screen.getByTestId('answer').props.value).toBe('kept');
  });

  it('Android back on a hidden tab returns to the tab it was opened from', async () => {
    renderApp();
    fireEvent.press(screen.getByText('Open rewards'));
    expect(app.getPathname()).toBe('/rewards');
    act(() => { pressBack(); });
    expect(app.getPathname()).toBe('/quizzes');
  });

  it('hidden tabs show a header Back', async () => {
    renderApp();
    fireEvent.press(screen.getByText('Open rewards'));
    fireEvent.press(screen.getByLabelText('Back'));
    expect(app.getPathname()).toBe('/quizzes');
  });

  it('Android back on a tab root goes to Dashboard, and from Dashboard it exits', async () => {
    const { exitApp } = BackHandler as unknown as { exitApp: jest.Mock };
    exitApp.mockClear();
    renderApp('/dashboard');
    fireEvent.press(screen.getByText('Go to course'));
    expect(app.getPathname()).toBe('/course');
    act(() => { pressBack(); });
    expect(app.getPathname()).toBe('/dashboard');
    expect(exitApp).not.toHaveBeenCalled();
    act(() => { pressBack(); });
    expect(exitApp).toHaveBeenCalledTimes(1);
  });

  it('Android back on a tab opened straight from a link goes to Dashboard first', async () => {
    renderApp('/course');
    act(() => { pressBack(); });
    expect(app.getPathname()).toBe('/dashboard');
  });

  it('"Open in LMS" switches the tabs already open instead of stacking a second copy', async () => {
    renderApp();
    fireEvent.press(screen.getByText('Push tap'));
    fireEvent.press(await screen.findByText('Open in LMS'));
    expect(app.getPathname()).toBe('/course');
    expect(rootRoutes()).toEqual(['(student)']);
  });

  it('signing out on a pushed screen and back in leaves one copy of the tabs', async () => {
    const { exitApp } = BackHandler as unknown as { exitApp: jest.Mock };
    exitApp.mockClear();
    renderApp('/dashboard');
    fireEvent.press(screen.getByText('Account'));
    act(() => { mockSignIn(false); });
    fireEvent.press(await screen.findByText('Sign in'));
    expect(app.getPathname()).toBe('/dashboard');
    expect(rootRoutes()).toEqual(['(student)']);
    act(() => { pressBack(); });
    expect(exitApp).toHaveBeenCalledTimes(1);
  });

  it('"Continue student learning" right after sign-in opens Dashboard, not the sign-in screen again', async () => {
    signInAs = staffLearner;
    try {
      act(() => { mockSignIn(false); });
      renderApp('/sign-in', WorkspaceScreen);
      fireEvent.press(await screen.findByText('Sign in'));
      expect(app.getPathname()).toBe('/workspace');
      fireEvent.press(await screen.findByText('Continue student learning'));
      expect(app.getPathname()).toBe('/dashboard');
      expect(screen.queryByText('Sign in')).toBeNull();
    } finally { signInAs = {}; act(() => { mockSignIn(true); }); }
  });

  it('"Continue student learning" from Profile returns to the tabs already open', async () => {
    act(() => { mockSignIn(true, staffLearner); });
    try {
      renderApp('/quizzes', WorkspaceScreen);
      fireEvent.changeText(screen.getByTestId('answer'), 'kept');
      act(() => { appRouter.push('/workspace'); });
      fireEvent.press(await screen.findByText('Continue student learning'));
      expect(app.getPathname()).toBe('/quizzes');
      expect(screen.getByTestId('answer').props.value).toBe('kept');
      expect(rootRoutes()).toEqual(['(student)']);
    } finally { act(() => { mockSignIn(true); }); }
  });

  it('"Continue student learning" after the wallet sign-in link opened Workspace over sign-in goes to Dashboard', async () => {
    const { exitApp } = BackHandler as unknown as { exitApp: jest.Mock };
    exitApp.mockClear();
    act(() => { mockSignIn(false); });
    try {
      renderApp('/sign-in', WorkspaceScreen);
      // The wallet's return link lands on a new screen pushed over sign-in, which then redirects to Workspace.
      act(() => { mockSignIn(true, staffLearner); appRouter.push('/workspace'); });
      expect(app.getPathname()).toBe('/workspace');
      fireEvent.press(await screen.findByText('Continue student learning'));
      expect(app.getPathname()).toBe('/dashboard');
      expect(rootRoutes()).toEqual(['(student)']);
      act(() => { pressBack(); });
      expect(exitApp).toHaveBeenCalledTimes(1);
    } finally { act(() => { mockSignIn(true); }); }
  });

  it('Android back from a lesson in the Course tab shows the course list, not the previous tab', async () => {
    renderApp('/dashboard', Pushed, CourseWithLesson);
    fireEvent.press(screen.getByText('Go to course'));
    expect(await screen.findByText('Lesson open')).toBeTruthy();
    act(() => { pressBack(); });
    expect(app.getPathname()).toBe('/course');
    expect(screen.getByText('Course list')).toBeTruthy();
    act(() => { pressBack(); });
    expect(app.getPathname()).toBe('/dashboard');
  });
});
