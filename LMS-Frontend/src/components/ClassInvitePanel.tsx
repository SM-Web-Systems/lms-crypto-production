/**
 * ClassInvitePanel — a teacher invites a learner to a class by email. The learner joins only after
 * accepting, so nobody can be added to a class (and its reward audiences) without agreeing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './Button';
import { teacherService, type ClassInvitation } from '../services/teacherService';
import { getErrorMessage } from '../utils/apiError';

export const ClassInvitePanel: React.FC<{ classId: string }> = ({ classId }) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ClassInvitation[]>([]);

  const load = useCallback(async () => {
    try { setPending((await teacherService.getClassInvitations(classId)).filter((i) => i.status === 'pending')); }
    catch { setPending([]); }
  }, [classId]);
  useEffect(() => { load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      setNotice(await teacherService.inviteLearner(classId, email.trim()));
      setEmail('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send the invitation.'));
    } finally { setBusy(false); }
  };

  const withdraw = async (id: string) => {
    try { await teacherService.cancelClassInvitation(classId, id); await load(); }
    catch (err) { setError(getErrorMessage(err, 'Could not withdraw the invitation.')); }
  };

  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      {!open ? (
        <button type="button" className="text-sm font-medium text-primary-600 hover:underline" onClick={() => setOpen(true)}>Invite a learner</button>
      ) : (
      <form onSubmit={invite} className="flex items-center gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Learner email"
          aria-label="Learner email" className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
        <Button size="sm" type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Invite'}</Button>
      </form>
      )}
      {notice ? <p role="status" className="mt-2 text-xs text-neutral-600">{notice}</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
      {pending.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {pending.map((i) => (
            <li key={i.id} className="flex items-center justify-between text-xs text-neutral-600">
              <span>{i.email} · waiting for them to accept</span>
              <button type="button" className="text-primary-600 hover:underline" onClick={() => withdraw(i.id)}>Withdraw</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
