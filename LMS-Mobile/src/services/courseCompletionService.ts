import api from '../lib/api';
import type { ApiResponse } from '../types/api';
import { assertApiOk, assertApiSuccess } from '../utils/apiError';

export interface LessonProgress {
  itemId: string;
  completedAt: string | null;
  progressPct: number | null;
  lastPositionS: number | null;
}
const lessonPath = (courseId: string, itemId: string) => `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(itemId)}`;

export const courseCompletionService = {
  async getLessonCompletions(courseId: string): Promise<LessonProgress[]> {
    const response = await api.get<ApiResponse<{ completions: { item_id: string; completed_at: string | null; progress_pct: number | null; last_position_s: number | null }[] }>>(`/courses/${encodeURIComponent(courseId)}/lessons/completions`, { params: { view: 'own' } });
    return assertApiSuccess(response, 'Could not load lesson progress.').completions.map((row) => ({ itemId: row.item_id, completedAt: row.completed_at, progressPct: row.progress_pct, lastPositionS: row.last_position_s }));
  },
  async markLessonComplete(courseId: string, itemId: string): Promise<void> {
    assertApiOk(await api.post<ApiResponse<void>>(`${lessonPath(courseId, itemId)}/complete`), 'Could not save lesson completion.');
  },
  async updateProgress(courseId: string, itemId: string, positionSeconds: number, progressPercent: number): Promise<void> {
    assertApiOk(await api.put<ApiResponse<void>>(`${lessonPath(courseId, itemId)}/progress`, { positionSeconds, progressPercent }), 'Could not save playback progress.');
  },
};

type PendingWrite = { itemId: string; kind: 'progress'; position: number; percent: number } | { itemId: string; kind: 'complete' };

/** Serial, coalesced writes prevent late playback saves from racing completion; failed writes remain retryable. */
export class LessonProgressSync {
  private pending = new Map<string, PendingWrite>();
  private running: Promise<void> | null = null;
  constructor(private courseId: string, private saved: (write: PendingWrite) => void) {}
  progress(itemId: string, position: number, percent: number) {
    this.pending.set(`${itemId}:progress`, { itemId, kind: 'progress', position: Math.max(0, Math.floor(position)), percent: Math.max(0, Math.min(100, Math.floor(percent))) });
    return this.flush();
  }
  complete(itemId: string) {
    this.pending.set(`${itemId}:complete`, { itemId, kind: 'complete' });
    return this.flush();
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    // Defer the drain so a child player's exit sample joins a parent cleanup flush in the same commit.
    this.running = Promise.resolve().then(() => this.drain()).finally(() => { this.running = null; });
    return this.running;
  }
  private async drain() {
    while (this.pending.size) {
      const [key, write] = this.pending.entries().next().value!;
      if (write.kind === 'complete') await courseCompletionService.markLessonComplete(this.courseId, write.itemId);
      else await courseCompletionService.updateProgress(this.courseId, write.itemId, write.position, write.percent);
      if (this.pending.get(key) === write) this.pending.delete(key);
      this.saved(write);
    }
  }
}
