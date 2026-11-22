import AsyncStorage from '@react-native-async-storage/async-storage';
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
  /**
   * Best effort: analytics must never get in the way of learning. A play with no connection (an offline file)
   * is kept on the phone and sent the next time a play is recorded online, so offline views still count.
   */
  async recordPlay(courseId: string, itemId: string, source: PlaySource, event: PlayEvent, percent?: number): Promise<void> {
    const play: PendingPlay = { courseId, itemId, source, event, percent, at: Date.now() };
    try {
      await sendPlay(play);
      void flushPendingPlays();
    } catch (error) {
      if (retryable(error)) await keepPlay(play);
    }
  },
};

interface PendingPlay { courseId: string; itemId: string; source: PlaySource; event: PlayEvent; percent?: number; at: number }
const pendingKey = 'lms.pending-plays.v1';
const maxPending = 100;
const maxAgeMs = 14 * 86_400_000;
let flushing: Promise<void> | null = null;

const platform = () => Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
async function sendPlay(play: PendingPlay) {
  await api.post(`${lessonPath(play.courseId, play.itemId)}/play-events`,
    { source: play.source, event: play.event, percent: play.percent, platform: platform() });
}
/** No connection, a timeout, or a busy server: worth sending later. A 4xx refusal is not. */
function retryable(error: unknown) {
  const status = (error as { status?: number; response?: { status?: number } } | null)?.status
    ?? (error as { response?: { status?: number } } | null)?.response?.status;
  return status === undefined || status === 429 || status >= 500;
}
async function readPending(): Promise<PendingPlay[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(pendingKey)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(p => p && typeof p.courseId === 'string' && Date.now() - p.at < maxAgeMs) : [];
  } catch { return []; }
}
async function keepPlay(play: PendingPlay) {
  try { await AsyncStorage.setItem(pendingKey, JSON.stringify([...(await readPending()), play].slice(-maxPending))); }
  catch { /* storage full: drop the event rather than bother the learner */ }
}

/** Send plays saved while offline. Stops at the first failure and keeps the rest for next time. */
export function flushPendingPlays(): Promise<void> {
  flushing ??= (async () => {
    const pending = await readPending();
    let sent = 0;
    for (const play of pending) {
      try { await sendPlay(play); sent++; } catch (error) { if (retryable(error)) break; sent++; }
    }
    if (sent) {
      try { await AsyncStorage.setItem(pendingKey, JSON.stringify((await readPending()).slice(sent))); } catch { /* retry later */ }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

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
