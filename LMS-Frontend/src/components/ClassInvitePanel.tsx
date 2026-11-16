/**
 * ClassInvitePanel — a teacher invites a learner to a class by email. The learner joins only after
 * accepting, so nobody can be added to a class (and its reward audiences) without agreeing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './Button';
import { teacherService, type ClassInvitation } from '../services/teacherService';
import { employerService } from '../services/employerService';
import { getErrorMessage } from '../utils/apiError';

const adapters = {
  class: { invite: teacherService.inviteLearner, list: teacherService.getClassInvitations, cancel: teacherService.cancelClassInvitation },
  team: { invite: employerService.inviteLearner, list: employerService.getTeamInvitations, cancel: employerService.cancelTeamInvitation },
};

/** Used for teacher classes and employer teams. */
export const ClassInvitePanel: React.FC<{ classId: string; kind?: 'class' | 'team' }> = ({ classId, kind = 'class' }) => {
  const api = adapters[kind];
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ClassInvitation[]>([]);

  const load = useCallback(async () => {
    try { setPending((await api.list(classId)).filter((i) => i.status === 'pending')); }
    catch { setPending([]); }
  }, [classId, api]);
  useEffect(() => { load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      setNotice(await api.invite(classId, email.trim()));
      setEmail('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send the invitation.'));
    } finally { setBusy(false); }
  };

  const withdraw = async (id: string) => {
    try { await api.cancel(classId, id); await load(); }
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
              <span className="break-all">{i.email} · {i.emailed ? 'sign-up link sent' : 'waiting for them to accept'}</span>
              <button type="button" className="text-primary-600 hover:underline" onClick={() => withdraw(i.id)}>Withdraw</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
