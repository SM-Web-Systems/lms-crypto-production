import { Platform } from 'react-native';
import api from '../lib/api';
import type { ApiResponse } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

const lessonPath = (courseId: string, itemId: string) => `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(itemId)}`;

export type PlaySource = 'youtube_embed' | 'youtube_app' | 'direct_file' | 'offline_file';
export type PlayEvent = 'start' | 'progress' | 'complete' | 'open_external';

export const lessonContentService = {
  /** The lesson reading as HTML the server fetched from GitHub (pinned, approved) and sanitized. */
  async getReading(courseId: string, itemId: string): Promise<{ html: string; source: 'github' | 'inline' }> {
    return assertApiSuccess(await api.get<ApiResponse<{ html: string; source: 'github' | 'inline' }>>(`${lessonPath(courseId, itemId)}/reading`),
      'Could not load this reading.');
  },
  /** Best effort: analytics must never get in the way of learning. */
  async recordPlay(courseId: string, itemId: string, source: PlaySource, event: PlayEvent, percent?: number): Promise<void> {
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    try { await api.post(`${lessonPath(courseId, itemId)}/play-events`, { source, event, percent, platform }); } catch { /* ignore */ }
  },
};

/** Sends start, 25/50/75 percent and complete once each for one opened lesson. */
export function createPlayTracker(courseId: string, itemId: string, source: PlaySource) {
  const sent = new Set<string>();
  const once = (key: string, event: PlayEvent, percent?: number) => {
    if (sent.has(key)) return;
    sent.add(key);
    void lessonContentService.recordPlay(courseId, itemId, source, event, percent);
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
