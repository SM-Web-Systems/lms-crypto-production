import api from '@/lib/api';
import { createPlayTracker, flushPendingPlays, lessonContentService } from '@/services/lessonContentService';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { post: jest.fn().mockResolvedValue({}), get: jest.fn() } }));

it('sends start, each milestone and complete once per opened lesson', () => {
  const record = jest.spyOn(lessonContentService, 'recordPlay').mockResolvedValue();
  const tracker = createPlayTracker('course', 'video', 'youtube_embed');
  tracker.progress(0);
  tracker.progress(10);
  tracker.progress(30);
  tracker.progress(31);
  tracker.progress(80);
  tracker.complete();
  tracker.complete();
  expect(record.mock.calls).toEqual([
    ['course', 'video', 'youtube_embed', 'start', undefined],
    ['course', 'video', 'youtube_embed', 'progress', 25],
    ['course', 'video', 'youtube_embed', 'progress', 50],
    ['course', 'video', 'youtube_embed', 'progress', 75],
    ['course', 'video', 'youtube_embed', 'complete', undefined],
  ]);
});

afterEach(() => jest.restoreAllMocks());

it('never lets an analytics failure reach the learner', async () => {
  (api.post as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await expect(lessonContentService.recordPlay('c', 'i', 'direct_file', 'start')).resolves.toBeUndefined();
});

it('keeps a play made without a connection and sends it once the phone is back online', async () => {
  const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
  const post = api.post as jest.Mock;
  post.mockReset();
  post.mockRejectedValueOnce(Object.assign(new Error('Network Error'), {status: undefined}));
  await lessonContentService.recordPlay('c', 'v', 'offline_file', 'start');
  expect(JSON.parse(await AsyncStorage.getItem('lms.pending-plays.v1'))).toHaveLength(1);
  post.mockResolvedValue({});
  await lessonContentService.recordPlay('c', 'v', 'youtube_embed', 'start');
  await flushPendingPlays();
  const sources = post.mock.calls.map(([, body]) => body.source);
  expect(sources).toEqual(['offline_file', 'youtube_embed', 'offline_file']);
  expect(JSON.parse(await AsyncStorage.getItem('lms.pending-plays.v1'))).toEqual([]);
});

it('does not keep a play the server refused', async () => {
  const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
  (api.post as jest.Mock).mockReset().mockRejectedValueOnce(Object.assign(new Error('Bad'), {status: 400}));
  await lessonContentService.recordPlay('c', 'v', 'offline_file', 'start');
  expect(await AsyncStorage.getItem('lms.pending-plays.v1')).toBeNull();
});
