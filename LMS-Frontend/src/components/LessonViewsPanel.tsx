import React, { useEffect, useState } from 'react';
import { Download, PlayCircle } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Button } from './Button';
import api from '../services/api';
import { downloadWithSession } from '../services/download';

export interface MediaLessonStats {
  courseId: string; courseTitle: string; itemId: string; itemTitle: string; itemType: string;
  plays: number; learners: number; completions: number; averagePercentWatched: number;
  youtubeEmbedPlays: number; youtubeAppOpens: number; directFilePlays: number; offlineFilePlays: number;
}

/** Admin view of lesson media plays: where learners watched, how far they got, and a CSV export. */
export const LessonViewsPanel: React.FC = () => {
  const [rows, setRows] = useState<MediaLessonStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let data: MediaLessonStats[] = [];
      try {
        // The server answers { data: { lessons: [...] } }; accept a bare array too so a shape change can't crash the dashboard.
        const res = await api.get<{ success: boolean; data: { lessons?: MediaLessonStats[] } | MediaLessonStats[] }>('/analytics/media');
        const body = res?.data?.data;
        const list = Array.isArray(body) ? body : body?.lessons;
        data = Array.isArray(list) ? list : [];
      } catch { /* the panel shows an empty state */ }
      if (!cancelled) setRows(data);
    })();
    return () => { cancelled = true; };
  }, []);
  if (!rows) return null;
  const exportCsv = () => {
    setError(null);
    downloadWithSession('/analytics/media', 'lesson-media-views.csv', { format: 'csv' })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not export lesson views.'));
  };
  return (
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-teal-50/30 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-accent-teal" aria-hidden />
            <CardTitle className="border-0 p-0 text-neutral-900">Lesson views</CardTitle>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
            Export CSV
          </Button>
        </div>
        {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-neutral-500">No video or audio plays recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Lesson</th>
                <th className="px-4 py-2.5 font-medium text-right">Plays</th>
                <th className="px-4 py-2.5 font-medium text-right">Learners</th>
                <th className="px-4 py-2.5 font-medium text-right">Completed</th>
                <th className="px-4 py-2.5 font-medium text-right">Avg watched</th>
                <th className="px-4 py-2.5 font-medium text-right">YouTube app</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((r) => (
                <tr key={`${r.courseId}:${r.itemId}`} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{r.itemTitle}</p>
                    <p className="text-xs text-neutral-500">{r.courseTitle}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.plays}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.learners}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.completions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.averagePercentWatched}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.youtubeAppOpens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
