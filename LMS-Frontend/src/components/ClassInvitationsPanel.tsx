/**
 * ClassInvitationsPanel — a learner sees classes that invited them and chooses to join or not.
 * Renders nothing when there is nothing to answer.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { classInvitationService, type MyClassInvitation } from '../services/classInvitationService';
import { getErrorMessage } from '../utils/apiError';

export const ClassInvitationsPanel: React.FC = () => {
  const [items, setItems] = useState<MyClassInvitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems(await classInvitationService.mine()); } catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const answer = async (id: string, accept: boolean) => {
    setBusyId(id); setError('');
    try { await classInvitationService.respond(id, accept); await load(); }
    catch (err) { setError(getErrorMessage(err, 'Could not answer the invitation.')); }
    finally { setBusyId(null); }
  };

  if (items.length === 0 && !error) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <CardTitle className="mb-3 text-base">Class invitations</CardTitle>
        {error ? <p role="alert" className="mb-2 text-sm text-red-700">{error}</p> : null}
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-neutral-800"><strong>{i.invitedBy}</strong> invited you to the class <strong>{i.className}</strong>. Joining lets them see your progress.</p>
              <span className="flex gap-2">
                <Button size="sm" disabled={busyId === i.id} onClick={() => answer(i.id, true)}>Join</Button>
                <Button size="sm" variant="outline" disabled={busyId === i.id} onClick={() => answer(i.id, false)}>Decline</Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
