/**
 * ParentInvitePanel — a parent asks to link to a learner who already has an account. The link exists only
 * after the learner accepts, so nobody can see a learner's records without their agreement.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { parentInvitationService, type SentParentInvitation } from '../services/parentInvitationService';
import { getErrorMessage } from '../utils/apiError';

export const ParentInvitePanel: React.FC = () => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<SentParentInvitation[]>([]);

  const load = useCallback(async () => {
    try { setPending((await parentInvitationService.sent()).filter((i) => i.status === 'pending')); }
    catch { setPending([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await parentInvitationService.invite(email.trim())); setEmail(''); await load(); }
    catch (err) { setError(getErrorMessage(err, 'Could not send the request.')); }
    finally { setBusy(false); }
  };

  const withdraw = async (id: string) => {
    try { await parentInvitationService.cancel(id); await load(); }
    catch (err) { setError(getErrorMessage(err, 'Could not withdraw the request.')); }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <CardTitle className="mb-1 text-base">Link a learner who already has an account</CardTitle>
        <p className="mb-3 text-sm text-neutral-600">We send them a request. You see their progress once they accept.</p>
        <form onSubmit={invite} className="flex flex-wrap items-center gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Learner email"
            aria-label="Learner email" className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
          <Button size="sm" type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send request'}</Button>
        </form>
        {notice ? <p role="status" className="mt-2 text-xs text-neutral-600">{notice}</p> : null}
        {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
        {pending.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                <span className="break-all">{i.email} · waiting for them to accept</span>
                <button type="button" className="text-primary-600 hover:underline" onClick={() => withdraw(i.id)}>Withdraw</button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
};
