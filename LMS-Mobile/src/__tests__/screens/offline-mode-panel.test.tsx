import {fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {OfflineLearningPanel} from '@/components/OfflineLearningPanel';
import type {SavedCourse} from '@/services/offlineLearning';

const mockDownload = jest.fn();
const mockView = jest.fn();
const mockRetain = jest.fn();
const mockLocalUri = jest.fn();
jest.mock('@/services/offlineLearningNative', () => ({
  supportsOfflineLearning: true,
  offlineLearning: {
    getSnapshot: () => 1, subscribe: () => () => undefined,
    view: () => mockView(), download: (...args: unknown[]) => mockDownload(...args), queue: jest.fn(), sync: jest.fn(),
  },
}));
jest.mock('@/services/offlineMedia', () => ({
  formatBytes: (bytes: number) => `${bytes} B`,
  offlineMedia: {totalBytes: async () => 2048, retain: (...a: unknown[]) => mockRetain(...a), localUri: (...a: unknown[]) => mockLocalUri(...a)},
}));
jest.mock('@/components/LessonMedia', () => {
  const {Text} = jest.requireActual('react-native');
  return {LessonVideo: ({url}: {url: string}) => <Text>{`video-player ${url}`}</Text>, LessonAudio: () => null};
});

const now = Date.now();
const saved: SavedCourse = {deadline: now + 60_000, pending: [], pack: {
  leaseId: 'lease', contentVersion: 'v', expiresAt: now + 60_000, issuedAt: now, serverTime: now, progress: [],
  course: {id: 'course', title: 'Offline course', sections: [{id: 's', title: 'S', items: [
    {id: 'vid', type: 'video', title: 'Intro', fileUrl: 'https://cdn.example/v.mp4', youtubeId: 'SyK8hJVq3_Q'},
  ]}]},
}};

beforeEach(async () => {
  await jest.requireMock('@react-native-async-storage/async-storage').clear();
  mockDownload.mockReset().mockResolvedValue(undefined);
  mockView.mockReset().mockResolvedValue({courses: [saved], notice: null});
});

it('saves text only in Online mode and the whole course with media in Offline mode', async () => {
  render(<OfflineLearningPanel courseId="course" />);
  fireEvent.press(screen.getByText('Save text lessons for offline use'));
  await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('course', expect.objectContaining({withMedia: false})));
  await waitFor(() => expect(screen.getByText('Close saved lessons')).toBeTruthy());
  fireEvent.press(screen.getByText('Offline mode'));
  await waitFor(() => expect(screen.getByText('Save course for offline use (with videos and audio)')).toBeTruthy());
  fireEvent.press(screen.getByText('Save course for offline use (with videos and audio)'));
  await waitFor(() => expect(mockDownload).toHaveBeenLastCalledWith('course', expect.objectContaining({withMedia: true})));
  // The buttons are disabled while the save finishes; switching back to Online mode frees the saved files.
  await waitFor(() => {
    fireEvent.press(screen.getByText('Online mode'));
    expect(mockRetain).toHaveBeenCalledWith([]);
  });
  await waitFor(() => expect(screen.getByText('Save text lessons for offline use')).toBeTruthy());
});

it('plays a saved video from the phone, or points to YouTube when it was not saved', async () => {
  mockLocalUri.mockResolvedValueOnce('file:///docs/lms-offline-media/x/y.mp4');
  render(<OfflineLearningPanel />);
  fireEvent.press(screen.getByText('Open saved lessons'));
  await waitFor(() => expect(screen.getByText('Video: Intro')).toBeTruthy());
  fireEvent.press(screen.getByText('Video: Intro'));
  await waitFor(() => expect(screen.getByText('video-player file:///docs/lms-offline-media/x/y.mp4')).toBeTruthy());
  fireEvent.press(screen.getByText('Back to saved courses'));
  mockLocalUri.mockResolvedValueOnce(null);
  fireEvent.press(screen.getByText('Video: Intro'));
  await waitFor(() => expect(screen.getByText('Watch on YouTube')).toBeTruthy());
});
