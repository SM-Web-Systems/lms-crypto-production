import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {Text} from 'react-native';
import {SessionBoundary} from '@/components/SessionBoundary';
import type {SavedCourse} from '@/services/offlineLearning';

let mockRevision = 1;
const mockListeners = new Set<() => void>();
const mockView = jest.fn();
const mockQueue = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({user: null, isLoading: false, sessionError: 'Connection unavailable.', refresh: jest.fn(), logout: jest.fn()}),
}));
jest.mock('@/services/offlineLearningNative', () => ({
  supportsOfflineLearning: true,
  offlineLearning: {
    getSnapshot: () => mockRevision,
    subscribe: (listener: () => void) => {
      mockListeners.add(listener);
      return () => { mockListeners.delete(listener); };
    },
    view: () => mockView(),
    queue: (...args: unknown[]) => mockQueue(...args),
    sync: jest.fn(),
  },
}));

function publish() {
  mockRevision++;
  mockListeners.forEach(listener => listener());
}

it('opens saved text from cold session recovery and separates pending completion from an acknowledgment', async () => {
  const now = Date.now();
  const saved: SavedCourse = {
    deadline: now + 60_000, pending: [], pack: {
      leaseId: 'lease', contentVersion: 'version', expiresAt: now + 60_000, issuedAt: now, serverTime: now,
      course: {id: 'course', title: 'Offline course', sections: [{id: 's', title: 'Section', items: [
        {id: 'item', type: 'text', title: 'Read lesson', information: 'Saved reading content'},
      ]}]},
      progress: [],
    },
  };
  mockView.mockImplementation(async () => ({courses: [saved], notice: null}));
  mockQueue.mockImplementation(async () => {
    saved.pending = [{kind: 'complete', itemId: 'item', idempotencyKey: 'op', leaseId: 'lease', contentVersion: 'version'}];
    publish();
  });
  render(<SessionBoundary><Text>Protected online screen</Text></SessionBoundary>);
  expect(screen.queryByText('Protected online screen')).toBeNull();
  fireEvent.press(screen.getByText('Open saved lessons'));
  await waitFor(() => expect(screen.getByText('Read lesson')).toBeTruthy());
  fireEvent.press(screen.getByText('Read lesson'));
  expect(screen.getByText('Saved reading content')).toBeTruthy();
  fireEvent.press(screen.getByText('Mark lesson complete'));
  await waitFor(() => expect(screen.getByText('Completion pending sync')).toBeTruthy());
  expect(mockQueue).toHaveBeenCalledWith('course', 'item', {kind: 'complete'});
  expect(screen.queryByText('Completed')).toBeNull();
  await act(async () => {
    saved.pending = [];
    saved.pack.progress = [{itemId: 'item', completedAt: 'server date', progressPct: 100, lastPositionS: null}];
    publish();
  });
  await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy());
  await act(async () => {
    mockView.mockResolvedValue({courses: [], notice: 'Access withdrawn.'});
    publish();
  });
  expect(screen.queryByText('Saved reading content')).toBeNull();
  expect(screen.getByText('Access withdrawn.')).toBeTruthy();
});
