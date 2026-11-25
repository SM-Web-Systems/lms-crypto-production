import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Trash2 } from 'lucide-react';
import { Card, CardContent } from './Card';
import { taService, type CourseTA } from '../services/taService';
import { getErrorMessage } from '../utils/apiError';

/** Assign and remove a course's teaching assistants (shown on the course editor). */
export default function CourseTAPanel({ courseId, isAdmin }: { courseId: string; isAdmin: boolean }) {
  const [tas, setTas] = useState<CourseTA[]>([]);
  const [canAssign, setCanAssign] = useState(isAdmin);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await taService.listCourseTAs(courseId);
      setTas(list.tas); setCanAssign(list.canAssign ?? isAdmin); setError('');
    }
    catch (e) { setError(getErrorMessage(e, 'Could not load teaching assistants.')); }
  }, [courseId, isAdmin]);
  useEffect(() => { void load(); }, [load]);

  const assign = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await taService.assignCourseTA(courseId, value);
      setEmail(''); setNotice(`${value} is now a teaching assistant on this course.`);
      await load();
    } catch (e) { setError(getErrorMessage(e, 'Could not assign that teaching assistant.')); }
    finally { setBusy(false); }
  };

  const remove = async (ta: CourseTA) => {
    setBusy(true); setError(''); setNotice('');
    try { await taService.removeCourseTA(courseId, ta.user_id); setNotice(`${ta.name || ta.email} was removed.`); await load(); }
    catch (e) { setError(getErrorMessage(e, 'Could not remove that teaching assistant.')); }
    finally { setBusy(false); }
  };

  return (
    <Card className="border border-neutral-200">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-200 bg-neutral-50/60">
        <GraduationCap className="h-4 w-4 text-accent-teal" aria-hidden />
        <h3 className="text-sm font-semibold text-neutral-800">Teaching assistants</h3>
      </div>
      <CardContent className="space-y-4 pt-4 pb-5">
        <p className="text-xs text-neutral-500">
          Teaching assistants grade this course's submissions; a lecturer or admin approves each grade. Only an administrator can assign a teaching assistant, and the person needs the Teaching assistant role first (Super Student does not count).
        </p>
        {tas.length === 0 ? <p className="text-sm text-neutral-500">No teaching assistants yet.</p> : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {tas.map((ta) => (
              <li key={ta.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0"><span className="font-medium text-neutral-800">{ta.name}</span> <span className="text-neutral-500 break-all">{ta.email}</span>
                  {ta.has_ta_role === false && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Inactive: no Teaching assistant role</span>}</span>
                <button type="button" disabled={busy} onClick={() => void remove(ta)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                  aria-label={`Remove ${ta.name || ta.email}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {!canAssign ? <p className="text-xs text-neutral-500">Ask an administrator to assign a teaching assistant to this course.</p> : (
        <form onSubmit={assign} className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="ta-email" className="sr-only">Teaching assistant email</label>
          <input id="ta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ta@example.com"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal" />
          <button type="submit" disabled={busy || !email.trim()}
            className="rounded-lg bg-accent-teal px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">Assign</button>
        </form>
        )}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
      </CardContent>
    </Card>
  );
}
