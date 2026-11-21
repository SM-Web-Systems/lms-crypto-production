import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({ default: { post: vi.fn().mockResolvedValue({}) } }));
import api from '../../services/api';
import { createPlayTracker, watchYouTubeFrame, withYouTubeProgress, lessonPlayService } from '../../services/lessonPlayService';

describe('lesson play analytics (web)', () => {
  beforeEach(() => vi.mocked(api.post).mockClear());

  it('sends start, each milestone and complete once', () => {
    const tracker = createPlayTracker('c1', 'v1', 'direct_file');
    [0, 10, 30, 31, 80].forEach((p) => tracker.progress(p));
    tracker.complete(); tracker.complete();
    const sent = vi.mocked(api.post).mock.calls.map(([, body]) => body);
    expect(sent).toEqual([
      { source: 'direct_file', event: 'start', percent: undefined, platform: 'web' },
      { source: 'direct_file', event: 'progress', percent: 25, platform: 'web' },
      { source: 'direct_file', event: 'progress', percent: 50, platform: 'web' },
      { source: 'direct_file', event: 'progress', percent: 75, platform: 'web' },
      { source: 'direct_file', event: 'complete', percent: undefined, platform: 'web' },
    ]);
  });

  it('sends nothing without a course and swallows network errors', async () => {
    createPlayTracker(undefined, 'v1', 'direct_file').complete();
    expect(api.post).not.toHaveBeenCalled();
    vi.mocked(api.post).mockRejectedValueOnce(new Error('offline'));
    await expect(lessonPlayService.recordPlay('c', 'i', 'youtube_app', 'open_external')).resolves.toBeUndefined();
  });

  it('turns on the YouTube iframe API only for YouTube embeds', () => {
    expect(withYouTubeProgress('https://www.youtube.com/embed/abc?rel=0')).toMatch(/^https:\/\/www\.youtube\.com\/embed\/abc\?rel=0&enablejsapi=1&origin=/);
    expect(withYouTubeProgress('https://player.vimeo.com/video/1')).toBe('https://player.vimeo.com/video/1');
  });

  it('reads progress only from the YouTube frame itself', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const tracker = { progress: vi.fn(), complete: vi.fn() };
    const stop = watchYouTubeFrame(frame, tracker);
    const info = (data: unknown, origin = 'https://www.youtube.com', source: unknown = frame.contentWindow) =>
      window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data), origin, source: source as Window }));
    info({ event: 'infoDelivery', info: { duration: 100, currentTime: 30 } });
    info({ event: 'infoDelivery', info: { currentTime: 90 } }, 'https://evil.example');
    info({ event: 'infoDelivery', info: { currentTime: 90 } }, 'https://www.youtube.com', window);
    info({ event: 'infoDelivery', info: { playerState: 0 } });
    expect(tracker.progress.mock.calls).toEqual([[30]]);
    expect(tracker.complete).toHaveBeenCalledTimes(1);
    stop();
    frame.remove();
  });
});
