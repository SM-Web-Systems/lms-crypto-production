import { useState } from 'react';
import { BackHandler, Pressable, Text, TextInput } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { useRouter } from 'expo-router';

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
  const user = {
    id: 'u1', email: 'learner@example.test', workspaces: ['student'],
    permissions: ['course.view', 'quiz.view', 'reward.view_own', 'certificate.view_own'],
  };
  return {
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
    useAuth: () => ({ user, isLoading: false, isAuthenticated: true }),
  };
});
jest.mock('@/components/SessionBoundary', () => ({ SessionBoundary: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/PushNotifications', () => ({ PushNotificationsBridge: () => null }));

const RootLayout = jest.requireActual('@/app/_layout').default;
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
function Dashboard() {
  const router = useRouter();
  return <Pressable onPress={() => router.navigate('/(student)/course')}><Text>Go to course</Text></Pressable>;
}
const pressBack = () => (BackHandler as unknown as { pressBack: () => void }).pressBack();

let app: ReturnType<typeof renderRouter>;
function renderApp(initialUrl = '/quizzes') {
  app = renderRouter({
    _layout: RootLayout,
    '(student)/_layout': StudentLayout,
    '(student)/dashboard': Dashboard,
    '(student)/course': Empty,
    '(student)/submissions': Empty,
    '(student)/messages': Empty,
    '(student)/certificates': Empty,
    '(student)/profile': Empty,
    '(student)/certificate-detail': Empty,
    '(student)/quizzes': HalfAnsweredQuiz,
    '(student)/forum': Empty,
    '(student)/documents': Empty,
    '(student)/rewards': Empty,
    notification: Pushed,
    account: Pushed,
    workspace: Pushed,
  }, { initialUrl });
}

describe('root Stack keeps the tab tree mounted', () => {
  it('a push tap opens Notification over the quiz, and Back returns with the answer kept', async () => {
    renderApp();
    fireEvent.changeText(screen.getByTestId('answer'), 'half done');
    fireEvent.press(screen.getByText('Push tap'));
    expect(app.getPathname()).toBe('/notification');
    fireEvent.press(screen.getByText('Back'));
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
});
