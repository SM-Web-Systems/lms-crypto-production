import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { courseCompletionService, LessonProgressSync, type LessonProgress } from '../services/courseCompletionService';
import { getErrorMessage } from '../utils/apiError';

export function useLessonProgress(courseId: string | undefined) {
  const [state, setState] = useState<{ courseId?: string; records: Record<string, LessonProgress> }>({ records: {} });
  const [failure, setFailure] = useState<{ courseId?: string; message: string } | null>(null);
  const [loaded, setLoaded] = useState<object | null>(null);
  const session = useMemo(() => ({ revision: 0, request: 0 }), [courseId]);
  const active = useRef<typeof session | null>(session);
  active.current = session;
  const sync = useMemo(() => courseId ? new LessonProgressSync(courseId, (write) => {
    if (active.current !== session) return;
    session.revision++;
    setState((prev) => {
      const records = prev.courseId === courseId ? prev.records : {};
      const old = records[write.itemId];
      return { courseId, records: { ...records, [write.itemId]: {
        itemId: write.itemId,
        completedAt: write.kind === 'complete' ? old?.completedAt || new Date().toISOString() : old?.completedAt ?? null,
        progressPct: write.kind === 'complete' || old?.completedAt ? 100 : Math.max(old?.progressPct ?? 0, write.percent),
        lastPositionS: write.kind === 'progress' ? write.position : old?.lastPositionS ?? null,
      } } };
    });
  }) : null, [courseId, session]);

  const run = useCallback(async (work: () => Promise<void>) => {
    try { await work(); if (active.current === session) setFailure((previous) => previous ? null : previous); } catch (error) { if (active.current === session) setFailure({ courseId, message: getErrorMessage(error, 'Progress has not synced. Retry when connected.') }); }
  }, [courseId, session]);
  const refresh = useCallback(async () => {
    if (!courseId) return;
    await run(async () => {
      await sync?.flush();
      const revision = session.revision;
      const request = ++session.request;
      const rows = await courseCompletionService.getLessonCompletions(courseId);
      if (active.current !== session || session.request !== request) return;
      // A slower read must not overwrite a write acknowledged while the read was in flight.
      if (session.revision !== revision) return;
      setState({ courseId, records: Object.fromEntries(rows.map((row) => [row.itemId, row])) });
      setLoaded(session);
    });
  }, [courseId, run, sync, session]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
      else void run(async () => { await sync?.flush(); });
    });
    return () => {
      if (active.current === session) active.current = null;
      clearInterval(timer); listener.remove(); void run(async () => { await sync?.flush(); });
    };
  }, [refresh, run, sync, session]);

  return {
    records: state.courseId === courseId ? state.records : {},
    loading: !!courseId && loaded !== session,
    error: failure?.courseId === courseId ? failure?.message : null,
    refresh,
    complete: (itemId: string) => run(async () => { await sync?.complete(itemId); }),
    progress: (itemId: string, position: number, percent: number) => run(async () => { await sync?.progress(itemId, position, percent); }),
    flush: () => run(async () => { await sync?.flush(); }),
  };
}
