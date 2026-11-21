import api from './api';

/**
 * Lesson media play events for view analytics. Best effort: a failed call never reaches the learner.
 * The server snaps progress to 25/50/75 percent and ignores repeats within 30 minutes.
 */
export type PlaySource = 'youtube_embed' | 'youtube_app' | 'direct_file' | 'offline_file';
export type PlayEvent = 'start' | 'progress' | 'complete' | 'open_external';

export const lessonPlayService = {
  async recordPlay(courseId: string, itemId: string, source: PlaySource, event: PlayEvent, percent?: number): Promise<void> {
    try {
      await api.post(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(itemId)}/play-events`,
        { source, event, percent, platform: 'web' });
    } catch { /* analytics must never get in the way of learning */ }
  },
};

export interface PlayTracker { progress(percent: number): void; complete(): void }

/** Sends start, 25/50/75 percent and complete once each for one opened lesson. */
export function createPlayTracker(courseId: string | undefined, itemId: string, source: PlaySource): PlayTracker {
  const sent = new Set<string>();
  const once = (key: string, event: PlayEvent, percent?: number) => {
    if (!courseId || sent.has(key)) return;
    sent.add(key);
    void lessonPlayService.recordPlay(courseId, itemId, source, event, percent);
  };
  return {
    progress(percent: number) {
      if (!Number.isFinite(percent) || percent <= 0) return;
      once('start', 'start');
      for (const milestone of [25, 50, 75]) if (percent >= milestone) once(`p${milestone}`, 'progress', milestone);
    },
    complete() { once('start', 'start'); once('complete', 'complete'); },
  };
}

const YOUTUBE_ORIGINS = ['https://www.youtube.com', 'https://www.youtube-nocookie.com'];

/** Adds the YouTube iframe API flag so the player reports its progress through postMessage. */
export function withYouTubeProgress(src: string): string {
  if (!/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(src)) return src;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${src}${src.includes('?') ? '&' : '?'}enablejsapi=1${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;
}

/**
 * Follows a YouTube iframe's progress without loading YouTube's script: after the frame loads we ask it to
 * start sending "infoDelivery" messages, and read currentTime/duration and the ended state from them.
 * Only messages from YouTube's own origins and from this frame are used.
 */
export function watchYouTubeFrame(frame: HTMLIFrameElement, tracker: PlayTracker): () => void {
  let duration = 0;
  const onMessage = (event: MessageEvent) => {
    if (!YOUTUBE_ORIGINS.includes(event.origin) || event.source !== frame.contentWindow) return;
    let data: { event?: string; info?: { currentTime?: number; duration?: number; playerState?: number } };
    try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
    if (data?.event !== 'infoDelivery' || !data.info) return;
    if (typeof data.info.duration === 'number' && data.info.duration > 0) duration = data.info.duration;
    if (data.info.playerState === 0) { tracker.complete(); return; }
    if (typeof data.info.currentTime === 'number' && duration > 0) tracker.progress((data.info.currentTime / duration) * 100);
  };
  const listen = () => {
    for (const origin of YOUTUBE_ORIGINS) {
      frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), origin);
    }
  };
  window.addEventListener('message', onMessage);
  frame.addEventListener('load', listen);
  listen();
  return () => { window.removeEventListener('message', onMessage); frame.removeEventListener('load', listen); };
}
