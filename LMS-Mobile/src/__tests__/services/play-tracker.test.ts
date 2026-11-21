import api from '@/lib/api';
import { createPlayTracker, lessonContentService } from '@/services/lessonContentService';

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
